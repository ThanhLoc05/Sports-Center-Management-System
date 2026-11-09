package com.sportscenter.management.service.impl;

import com.sportscenter.management.entity.MembershipOrder;
import com.sportscenter.management.payment.MembershipNotificationService;
import com.sportscenter.management.repository.InvoiceRepository;
import org.aopalliance.intercept.MethodInterceptor;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

/** Real HTTP/JWT, database locks and transactions. Hooks only coordinate/fail test requests. */
@EnabledIfSystemProperty(named="sportiva.payment-sqlserver",matches="true")
@Import(PaymentLifecycleSqlServerIT.Hooks.class)
class PaymentLifecycleSqlServerIT extends PaymentSqlServerSupport {
    int packageId;
    static final AtomicInteger failOrder=new AtomicInteger(-1),readInvoice=new AtomicInteger(-1);
    static volatile CountDownLatch readers,release;
    @TestConfiguration static class Hooks {
        @Bean static BeanPostProcessor paymentTestHooks() {
            return new BeanPostProcessor() {
                @Override public Object postProcessAfterInitialization(Object bean,String name) {
                    if(!(bean instanceof InvoiceRepository)&&!(bean instanceof MembershipNotificationService))return bean;
                    ProxyFactory proxy=new ProxyFactory(bean);
                    if(bean instanceof MembershipNotificationService)proxy.setProxyTargetClass(true);
                    proxy.addAdvice((MethodInterceptor) invocation -> {
                        Object value=invocation.proceed();
                        if(bean instanceof InvoiceRepository && invocation.getMethod().getName().equals("findById")
                                && Objects.equals(invocation.getArguments()[0],readInvoice.get())) {
                            readers.countDown();
                            if(!release.await(12,TimeUnit.SECONDS))throw new IllegalStateException("Refund barrier timed out");
                        }
                        if(bean instanceof MembershipNotificationService && invocation.getMethod().getName().equals("notifyConfirmed")
                                && ((MembershipOrder)invocation.getArguments()[0]).getId()==failOrder.get())
                            throw new IllegalStateException("Controlled integration rollback");
                        return value;
                    });
                    return proxy.getProxy();
                }
            };
        }
    }
    @BeforeEach void packageFixture() throws Exception {
        Api result=status(201,call("POST","memberships/packages","{\"packageName\":\"Payment IT "+UUID.randomUUID()+"\",\"durationDays\":10,\"price\":100000,\"accessLevel\":\"STANDARD\",\"status\":\"ACTIVE\"}",managerToken,null));
        packageId=(int)number(result,"$.id");
    }
    @AfterEach void clearHooks(){failOrder.set(-1);readInvoice.set(-1);if(release!=null)release.countDown();}

    Api create(Integer source,String key) throws Exception {
        return call("POST","membership-orders","{\"memberId\":"+memberId+",\"packageId\":"+packageId+",\"paymentMethod\":\"CASH\""+(source==null?"":",\"sourceSubscriptionId\":"+source)+"}",receptionToken,key);
    }
    Api confirm(int order,int version,String key) throws Exception {
        return call("POST","membership-orders/"+order+"/confirm-payment","{\"version\":"+version+"}",receptionToken,key);
    }
    Api paid(Integer source) throws Exception {
        Api pending=status(201,create(source,UUID.randomUUID().toString()));
        return status(200,confirm((int)number(pending,"$.id"),(int)number(pending,"$.version"),UUID.randomUUID().toString()));
    }
    void persisted(Api result,String orderState,String invoiceState,String subState) {
        int order=(int)number(result,"$.id"),invoice=(int)number(result,"$.invoice.id");
        assertEquals(orderState,jdbc.queryForObject("SELECT status FROM membership_orders WHERE membership_order_id=?",String.class,order));
        assertEquals(invoiceState,jdbc.queryForObject("SELECT payment_status FROM invoices WHERE invoice_id=? AND membership_order_id=?",String.class,invoice,order));
        if(subState!=null)assertEquals(subState,jdbc.queryForObject("SELECT s.status FROM member_subscriptions s JOIN invoices i ON i.subscription_id=s.subscription_id WHERE i.invoice_id=? AND s.member_id=?",String.class,invoice,memberId));
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM invoices WHERE membership_order_id=?",Integer.class,order));
    }
    @Test void cashLifecycleIdempotencyAuthorizationAndRefundStayConsistent() throws Exception {
        String key=UUID.randomUUID().toString();
        Api pending=status(201,create(null,key));int order=(int)number(pending,"$.id"),invoice=(int)number(pending,"$.invoice.id");
        persisted(pending,"PENDING_PAYMENT","PENDING",null);
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM member_subscriptions WHERE member_id=?",Integer.class,memberId));
        assertEquals(order,number(status(201,create(null,key)),"$.id"));
        status(409,call("POST","membership-orders","{\"memberId\":"+memberId+",\"packageId\":"+(packageId+1)+",\"paymentMethod\":\"CASH\"}",receptionToken,key));
        status(409,create(null,UUID.randomUUID().toString()));
        status(409,call("POST","payments/invoices/"+invoice+"/pay",null,receptionToken,null));
        status(400,call("POST","payments/invoices/"+invoice+"/refund",null,managerToken,null));
        status(403,call("POST","payments/invoices/"+invoice+"/refund",null,receptionToken,null));
        status(403,call("POST","membership-orders/"+order+"/confirm-payment","{\"version\":0}",memberToken,UUID.randomUUID().toString()));
        status(409,confirm(order,99,UUID.randomUUID().toString()));
        persisted(pending,"PENDING_PAYMENT","PENDING",null);
        String confirmKey=UUID.randomUUID().toString();Api confirmed=status(200,confirm(order,0,confirmKey));
        persisted(confirmed,"CONFIRMED","PAID","ACTIVE");
        int sub=(int)number(confirmed,"$.subscription.id");
        assertEquals(sub,number(status(200,confirm(order,0,confirmKey)),"$.subscription.id"));
        assertEquals(sub,number(status(200,confirm(order,0,UUID.randomUUID().toString())),"$.subscription.id"));
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM member_subscriptions WHERE member_id=?",Integer.class,memberId));
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM membership_notifications WHERE order_id=?",Integer.class,order));
        status(200,call("POST","payments/invoices/"+invoice+"/refund",null,managerToken,null));
        Api refunded=status(200,call("GET","membership-orders/"+order,null,memberToken,null));
        assertEquals("REFUNDED",refunded.json().read("$.status"));
        assertEquals("REFUNDED",refunded.json().read("$.invoice.paymentStatus"));
        assertEquals("CANCELLED",refunded.json().read("$.subscription.status"));
        assertEquals("SENT",refunded.json().read("$.delivery.notification.status"));
        persisted(refunded,"REFUNDED","REFUNDED","CANCELLED");
        status(400,call("POST","payments/invoices/"+invoice+"/refund",null,managerToken,null));
        status(409,confirm(order,1,UUID.randomUUID().toString()));
        status(409,create(sub,UUID.randomUUID().toString()));
    }
    @Test void renewalsAppendAfterLatestConfirmedPeriodWithoutOverlap() throws Exception {
        Api original=paid(null);int source=(int)number(original,"$.subscription.id");
        LocalDate end=LocalDate.parse(original.json().read("$.subscription.endDate",String.class));
        Api first=paid(source);Api second=paid(source);
        for(Api renewal:List.of(first,second))persisted(renewal,"CONFIRMED","PAID","ACTIVE");
        assertEquals(end.plusDays(1).toString(),first.json().read("$.subscription.startDate"));
        assertEquals(end.plusDays(10).toString(),first.json().read("$.subscription.endDate"));
        assertEquals(end.plusDays(11).toString(),second.json().read("$.subscription.startDate"));
        assertEquals(end.plusDays(20).toString(),second.json().read("$.subscription.endDate"));
        // Future ACTIVE periods do not replace today's currently usable source period.
        Api active=status(200,call("GET","memberships/members/"+memberId+"/active",null,memberToken,null));
        assertEquals(source,number(active,"$.id"));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM member_subscriptions a JOIN member_subscriptions b ON a.member_id=b.member_id AND a.subscription_id<b.subscription_id AND a.start_date<=b.end_date AND b.start_date<=a.end_date WHERE a.member_id=? AND a.status='ACTIVE' AND b.status='ACTIVE'",Integer.class,memberId));
    }
    @Test void expiredSourceRenewsFromTodayAndRefundedSourceCannotConfirmPendingRenewal() throws Exception {
        Api original=paid(null);int source=(int)number(original,"$.subscription.id");
        LocalDate today=LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh"));
        jdbc.update("UPDATE member_subscriptions SET start_date=?,end_date=?,status='EXPIRED' WHERE subscription_id=?",today.minusDays(20),today.minusDays(11),source);
        Api renewal=paid(source);
        assertEquals(today.toString(),renewal.json().read("$.subscription.startDate"));
        assertEquals(today.plusDays(9).toString(),renewal.json().read("$.subscription.endDate"));
        persisted(renewal,"CONFIRMED","PAID","ACTIVE");
        int current=(int)number(renewal,"$.subscription.id");
        Api waiting=status(201,create(current,UUID.randomUUID().toString()));
        status(200,call("POST","payments/invoices/"+number(renewal,"$.invoice.id")+"/refund",null,managerToken,null));
        status(409,confirm((int)number(waiting,"$.id"),0,UUID.randomUUID().toString()));
        persisted(waiting,"PENDING_PAYMENT","PENDING",null);
        assertEquals(2,jdbc.queryForObject("SELECT COUNT(*) FROM member_subscriptions WHERE member_id=?",Integer.class,memberId));
    }
    @Test void failureAfterNotificationInsertRollsBackEntireConfirmation() throws Exception {
        Api pending=status(201,create(null,UUID.randomUUID().toString()));int order=(int)number(pending,"$.id");
        failOrder.set(order);
        try{status(500,confirm(order,0,UUID.randomUUID().toString()));}finally{failOrder.set(-1);}
        persisted(pending,"PENDING_PAYMENT","PENDING",null);
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM member_subscriptions WHERE member_id=?",Integer.class,memberId));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM membership_notifications WHERE order_id=?",Integer.class,order));
        persisted(status(200,confirm(order,0,UUID.randomUUID().toString())),"CONFIRMED","PAID","ACTIVE");
    }
    @Test void concurrentRefundsRecheckLatestInvoiceAfterLock() throws Exception {
        Api order=paid(null);int invoice=(int)number(order,"$.invoice.id");
        readers=new CountDownLatch(2);release=new CountDownLatch(1);readInvoice.set(invoice);
        try(var workers=Executors.newFixedThreadPool(2)) {
            Callable<Integer> request=()->call("POST","payments/invoices/"+invoice+"/refund",null,managerToken,null).status();
            var first=workers.submit(request);var second=workers.submit(request);
            try{assertTrue(readers.await(10,TimeUnit.SECONDS),"Both transactions must preload the invoice");}
            finally{release.countDown();}
            var statuses=new ArrayList<>(List.of(first.get(25,TimeUnit.SECONDS),second.get(25,TimeUnit.SECONDS)));
            Collections.sort(statuses);assertEquals(List.of(200,400),statuses);
        } finally {readInvoice.set(-1);}
        persisted(order,"REFUNDED","REFUNDED","CANCELLED");
    }
    @Test void concurrentLegacyPaymentsRecheckLatestInvoiceAfterLock() throws Exception {
        int invoice=invoices.saveAndFlush(com.sportscenter.management.entity.Invoice.builder()
                .memberId(memberId).amount(new java.math.BigDecimal("100000")).currency("VND")
                .paymentMethod("CASH").paymentStatus("PENDING").createdAt(LocalDateTime.now()).build()).getId();
        readers=new CountDownLatch(2);release=new CountDownLatch(1);readInvoice.set(invoice);
        try(var workers=Executors.newFixedThreadPool(2)) {
            Callable<Integer> request=()->call("POST","payments/invoices/"+invoice+"/pay",null,receptionToken,null).status();
            var first=workers.submit(request);var second=workers.submit(request);
            try{assertTrue(readers.await(10,TimeUnit.SECONDS));}finally{release.countDown();}
            var statuses=new ArrayList<>(List.of(first.get(25,TimeUnit.SECONDS),second.get(25,TimeUnit.SECONDS)));
            Collections.sort(statuses);assertEquals(List.of(200,400),statuses);
        } finally{readInvoice.set(-1);}
        assertEquals("PAID",jdbc.queryForObject("SELECT payment_status FROM invoices WHERE invoice_id=?",String.class,invoice));
    }
    @Test void refundPreloadedAsPendingSeesConfirmationCommittedBeforeItTakesLock() throws Exception {
        Api pending=status(201,create(null,UUID.randomUUID().toString()));
        int invoice=(int)number(pending,"$.invoice.id"),order=(int)number(pending,"$.id");
        readers=new CountDownLatch(1);release=new CountDownLatch(1);readInvoice.set(invoice);
        try(var workers=Executors.newSingleThreadExecutor()) {
            var refund=workers.submit(()->call("POST","payments/invoices/"+invoice+"/refund",null,managerToken,null));
            try {
                assertTrue(readers.await(10,TimeUnit.SECONDS));
                persisted(status(200,confirm(order,0,UUID.randomUUID().toString())),"CONFIRMED","PAID","ACTIVE");
            } finally {release.countDown();}
            status(200,refund.get(25,TimeUnit.SECONDS));
        } finally {readInvoice.set(-1);}
        persisted(pending,"REFUNDED","REFUNDED","CANCELLED");
    }
}

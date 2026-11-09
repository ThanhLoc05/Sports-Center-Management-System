package com.sportscenter.management.service.impl;

import com.sportscenter.SportsCenterApplication;
import com.sportscenter.management.entity.*;
import com.sportscenter.management.repository.*;
import com.jayway.jsonpath.DocumentContext;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

/** Opt-in HTTP + real SQL Server coverage. Never creates, migrates or drops a database. */
@EnabledIfSystemProperty(named="sportiva.payment-sqlserver", matches="true")
class PaymentRevenueSqlServerIT extends PaymentSqlServerSupport {
    @Test void revenueBeforeAndAfterRefundMatchesSqlInEachCashFlowPeriod() throws Exception {
        String firstStart="2081-01-01T00:00:00", firstEnd="2081-01-31T23:59:59";
        String secondStart="2081-02-01T00:00:00", secondEnd="2081-02-28T23:59:59";
        var initial=summary(firstStart,firstEnd);
        var initialSecond=summary(secondStart,secondEnd);
        int same=invoice("PAID","250", "2081-01-10T12:00:00",null);
        int cross=invoice("PAID","400", "2081-01-11T12:00:00",null);
        invoice("PAID","100", "2081-01-12T12:00:00",null);
        invoice("PENDING","777", "2081-01-12T12:00:00",null);
        invoice("CANCELLED","888", "2081-01-12T12:00:00",null);
        assertDelta(initial,summary(firstStart,firstEnd),"750","0","750",3,0);
        sqlMatchesApi(firstStart,firstEnd);
        status(200,call("POST","payments/invoices/"+same+"/refund",null,managerToken,null));
        assertEquals("REFUNDED",jdbc.queryForObject("SELECT payment_status FROM invoices WHERE invoice_id=?",String.class,same));
        assertNotNull(jdbc.queryForObject("SELECT refunded_at FROM invoices WHERE invoice_id=?",java.sql.Timestamp.class,same));
        // Controlled timestamps are fixture setup, not changes to the application clock.
        jdbc.update("UPDATE invoices SET refunded_at=? WHERE invoice_id=?",LocalDateTime.parse("2081-01-15T12:00:00"),same);
        assertDelta(initial,summary(firstStart,firstEnd),"750","250","500",3,1);
        status(200,call("POST","payments/invoices/"+cross+"/refund",null,managerToken,null));
        jdbc.update("UPDATE invoices SET refunded_at=? WHERE invoice_id=?",LocalDateTime.parse("2081-02-02T12:00:00"),cross);
        assertDelta(initial,summary(firstStart,firstEnd),"750","250","500",3,1);
        assertDelta(initialSecond,summary(secondStart,secondEnd),"0","400","-400",0,1);
        sqlMatchesApi(firstStart,firstEnd);sqlMatchesApi(secondStart,secondEnd);
        // Legacy rows without dates use created_at, including the corresponding refund.
        invoice("PAID","50",null,null);
        invoice("REFUNDED","60",null,null);
        assertDelta(initial,summary(firstStart,firstEnd),"860","310","550",5,2);
        sqlMatchesApi(firstStart,firstEnd);
        sqlMatchesApi("2098-01-01T00:00:00","2098-01-31T23:59:59");
    }

    @Test void reportsValidateRangeAndEnforceManagerRole() throws Exception {
        String query="reports/summary?startDate=2081-02-01T00:00:00&endDate=2081-01-01T00:00:00";
        status(400,call("GET",query,null,managerToken,null));
        status(403,call("GET","reports/summary?startDate=2081-01-01T00:00:00&endDate=2081-02-01T00:00:00",null,memberToken,null));
        status(403,call("GET","reports/revenue?startDate=2081-01-01T00:00:00&endDate=2081-02-01T00:00:00",null,receptionToken,null));
    }

    @Test void paymentMethodBreakdownRemainsGrossAcrossCashAndTransferFixtures() throws Exception {
        String from="2081-01-01T00:00:00",to="2081-01-31T23:59:59";
        Api before=summary(from,to);
        int paid=invoice("PAID","150","2081-01-20T12:00:00",null);
        int refunded=invoice("REFUNDED","110","2081-01-21T12:00:00","2081-01-22T12:00:00");
        // Synthetic historical bank rows only; no bank account, webhook or gateway is invoked.
        jdbc.update("UPDATE invoices SET payment_method='BANK_TRANSFER' WHERE invoice_id IN (?,?)",paid,refunded);
        Api after=summary(from,to);
        assertDelta(before,after,"260","110","150",2,1);
        Map<String,Number> oldMethods=before.json().read("$.revenueByMethod");
        Map<String,Number> newMethods=after.json().read("$.revenueByMethod");
        money("260",new BigDecimal(newMethods.get("BANK_TRANSFER").toString())
                .subtract(new BigDecimal(oldMethods.getOrDefault("BANK_TRANSFER",0).toString())));
        sqlMatchesApi(from,to);
    }

    private int invoice(String state,String amount,String paidAt,String refundedAt) {
        return invoices.saveAndFlush(Invoice.builder().memberId(memberId).currency("VND")
                .amount(new BigDecimal(amount)).paymentMethod("CASH").paymentStatus(state)
                .createdAt(LocalDateTime.parse("2081-01-03T12:00:00"))
                .paidAt(paidAt==null?null:LocalDateTime.parse(paidAt))
                .refundedAt(refundedAt==null?null:LocalDateTime.parse(refundedAt)).build()).getId();
    }
    private Api summary(String from,String to) throws Exception {
        return status(200,call("GET","reports/summary?startDate="+from+"&endDate="+to,null,managerToken,null));
    }
    private void assertDelta(Api before,Api after,String gross,String refund,String net,long collected,long refunds) {
        money(gross,decimal(after,"$.totalGrossRevenue").subtract(decimal(before,"$.totalGrossRevenue")));
        money(refund,decimal(after,"$.totalRefunded").subtract(decimal(before,"$.totalRefunded")));
        money(net,decimal(after,"$.netRevenue").subtract(decimal(before,"$.netRevenue")));
        assertEquals(collected,number(after,"$.totalPaidInvoices")-number(before,"$.totalPaidInvoices"));
        assertEquals(refunds,number(after,"$.totalRefundedInvoices")-number(before,"$.totalRefundedInvoices"));
    }
    private void sqlMatchesApi(String from,String to) throws Exception {
        Api api=summary(from,to);
        var a=LocalDateTime.parse(from);var b=LocalDateTime.parse(to);
        var gross=jdbc.queryForObject("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE payment_status IN ('PAID','REFUNDED') AND COALESCE(paid_at,created_at) BETWEEN ? AND ?",BigDecimal.class,a,b);
        var refund=jdbc.queryForObject("SELECT COALESCE(SUM(amount),0) FROM invoices WHERE payment_status='REFUNDED' AND COALESCE(refunded_at,created_at) BETWEEN ? AND ?",BigDecimal.class,a,b);
        money(gross.toPlainString(),decimal(api,"$.totalGrossRevenue"));
        money(refund.toPlainString(),decimal(api,"$.totalRefunded"));
        money(gross.subtract(refund).toPlainString(),decimal(api,"$.netRevenue"));
        var methods=jdbc.queryForList("SELECT payment_method,SUM(amount) amount FROM invoices WHERE payment_status IN ('PAID','REFUNDED') AND COALESCE(paid_at,created_at) BETWEEN ? AND ? GROUP BY payment_method",a,b);
        Map<String,Number> breakdown=api.json().read("$.revenueByMethod");
        assertEquals(methods.size(),breakdown.size());
        for(var method:methods) money(method.get("amount").toString(),new BigDecimal(breakdown.get(method.get("payment_method")).toString()));
        var collected=jdbc.queryForObject("SELECT COUNT_BIG(*) FROM invoices WHERE payment_status IN ('PAID','REFUNDED') AND COALESCE(paid_at,created_at) BETWEEN ? AND ?",Long.class,a,b);
        var refunded=jdbc.queryForObject("SELECT COUNT_BIG(*) FROM invoices WHERE payment_status='REFUNDED' AND COALESCE(refunded_at,created_at) BETWEEN ? AND ?",Long.class,a,b);
        assertEquals(collected.longValue(),number(api,"$.totalPaidInvoices"));
        assertEquals(refunded.longValue(),number(api,"$.totalRefundedInvoices"));
        for(String path:List.of("reports/revenue","payments/revenue")) {
            Api value=status(200,call("GET",path+"?startDate="+from+"&endDate="+to,null,managerToken,null));
            money(gross.subtract(refund).toPlainString(),new BigDecimal(value.json().jsonString()));
        }
    }
}

/** Shared test fixture support: random credentials remain in RAM, persisted only as BCrypt hashes. */
@SpringBootTest(classes=SportsCenterApplication.class,webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
        "server.address=127.0.0.1",
        "spring.datasource.url=jdbc:sqlserver://DESKTOP-IKVPEK1;instanceName=SQLEXPRESS;databaseName=SportivaPayment_20261109;integratedSecurity=true;encrypt=true;trustServerCertificate=true;applicationName=SportivaPaymentIT",
        "spring.datasource.username=", "spring.datasource.password=", "spring.jpa.hibernate.ddl-auto=validate",
        "spring.sql.init.mode=never", "spring.flyway.enabled=false", "spring.liquibase.enabled=false",
        "spring.jpa.show-sql=false", "logging.level.org.springframework.web=WARN", "logging.level.org.springframework.security=WARN"})
abstract class PaymentSqlServerSupport {
    @Value("${local.server.port}") int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired InvoiceRepository invoices;
    int memberId;
    String managerToken,memberToken,receptionToken;
    final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    record Api(int status,DocumentContext json) {}
    @BeforeEach void actors() throws Exception {
        assertEquals("DESKTOP-IKVPEK1\\SQLEXPRESS|SportivaPayment_20261109",
                jdbc.queryForObject("SELECT CONVERT(varchar(128),@@SERVERNAME)+'|'+DB_NAME()",String.class));
        String password=UUID.randomUUID().toString();
        var manager=actor("CENTER_MANAGER",password);var member=actor("MEMBER",password);var reception=actor("RECEPTIONIST",password);
        memberId=member.getId();
        managerToken=login(manager.getEmail(),password);memberToken=login(member.getEmail(),password);receptionToken=login(reception.getEmail(),password);
    }
    User actor(String role,String password) {
        String key=UUID.randomUUID().toString();
        return users.saveAndFlush(User.builder().email(key+"@example.com").phone(key).fullName("Payment integration fixture")
                .passwordHash(new BCryptPasswordEncoder().encode(password)).role(roles.findByRoleName(role).orElseThrow())
                .status("ACTIVE").createdAt(LocalDateTime.now()).build());
    }
    String login(String email,String password) throws Exception {
        Api response=status(200,call("POST","users/login","{\"email\":\""+email+"\",\"password\":\""+password+"\"}",null,null));
        return response.json().read("$.token",String.class);
    }
    Api call(String method,String path,String body,String token,String key) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/v1/"+path)).timeout(Duration.ofSeconds(20));
        if(token!=null)builder.header("Authorization","Bearer "+token);
        if(key!=null)builder.header("Idempotency-Key",key);
        builder.header("Content-Type","application/json");
        builder.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body));
        var response=client.send(builder.build(),HttpResponse.BodyHandlers.ofString());
        return new Api(response.statusCode(),JsonPath.parse(response.body().isBlank()?"{}":response.body()));
    }
    static Api status(int expected,Api response) {assertEquals(expected,response.status());return response;}
    static long number(Api a,String path){return ((Number)a.json().read(path)).longValue();}
    static BigDecimal decimal(Api a,String path){return new BigDecimal(a.json().read(path).toString());}
    static void money(String expected,BigDecimal actual){assertEquals(0,new BigDecimal(expected).compareTo(actual));}
}

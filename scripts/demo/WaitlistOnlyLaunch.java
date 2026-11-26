import com.sportscenter.SportsCenterApplication;
import com.sportscenter.management.service.WaitlistJobs;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.beans.factory.support.RootBeanDefinition;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor;
import org.springframework.scheduling.config.TaskManagementConfigUtils;

import java.util.Map;
import java.util.regex.Pattern;

/** Opt-in launcher for a demo or isolated QA database. */
public final class WaitlistOnlyLaunch {
    private static final Pattern DATABASE_PROPERTY = Pattern.compile(";databaseName=([^;]+)", Pattern.CASE_INSENSITIVE);

    public static final class WaitlistOnlyScheduler extends ScheduledAnnotationBeanPostProcessor {
        @Override
        public Object postProcessAfterInitialization(Object bean, String name) {
            return bean instanceof WaitlistJobs ? super.postProcessAfterInitialization(bean, name) : bean;
        }
    }

    public static void main(String[] args) {
        String catalog = System.getenv("SPORTIVA_WAITLIST_DATABASE");
        String url = System.getenv("DB_URL");
        if (catalog == null || !catalog.matches("SportivaDemo_[A-Za-z0-9_]+|SportivaFlowAcceptance_[a-f0-9]+|SportivaFlexibleTest_[a-f0-9]+")
                || url == null || !url.startsWith("jdbc:sqlserver://")) {
            throw new IllegalStateException("Set DB_URL and SPORTIVA_WAITLIST_DATABASE for an approved demo or QA catalog.");
        }
        var database = DATABASE_PROPERTY.matcher(url);
        if (!database.find() || !catalog.equals(database.group(1)) || database.find()) {
            throw new IllegalStateException("DB_URL must name the approved catalog exactly once.");
        }

        var application = new SpringApplication(SportsCenterApplication.class);
        application.addListeners((ApplicationListener<ApplicationEnvironmentPreparedEvent>) event ->
                requireSafeSettings(event.getEnvironment(), url));
        String scheduler = TaskManagementConfigUtils.SCHEDULED_ANNOTATION_PROCESSOR_BEAN_NAME;
        application.addInitializers(context -> context.addBeanFactoryPostProcessor(factory -> {
            var registry = (BeanDefinitionRegistry) factory;
            registry.removeBeanDefinition(scheduler);
            var definition = new RootBeanDefinition(WaitlistOnlyScheduler.class);
            definition.setRole(BeanDefinition.ROLE_INFRASTRUCTURE);
            registry.registerBeanDefinition(scheduler, definition);
        }));
        application.addListeners((ApplicationListener<ApplicationReadyEvent>) event -> {
            var processor = event.getApplicationContext().getBean(scheduler, WaitlistOnlyScheduler.class);
            var jobs = processor.getScheduledTasks().stream().map(Object::toString).toList();
            if (!jobs.equals(java.util.List.of(WaitlistJobs.class.getName() + ".advanceWaitlists"))) {
                throw new IllegalStateException("Unexpected scheduled jobs: " + jobs);
            }
            System.out.println("Scheduled jobs: " + jobs);
        });
        application.run(args);
    }

    private static void requireSafeSettings(Environment environment, String url) {
        if (!url.equals(environment.getProperty("spring.datasource.url"))) {
            throw new IllegalStateException("The effective datasource differs from DB_URL.");
        }
        Map.of(
                "spring.jpa.hibernate.ddl-auto", "validate",
                "spring.sql.init.mode", "never",
                "spring.flyway.enabled", "false",
                "spring.liquibase.enabled", "false",
                "app.demo.flow4.enabled", "false",
                "app.training.scheduling-enabled", "false",
                "app.me09.scheduling-enabled", "false",
                "app.booking.waitlist-worker-enabled", "true",
                "membership.payment.webhook-enabled", "false"
        ).forEach((key, value) -> {
            if (!value.equalsIgnoreCase(environment.getProperty(key))) {
                throw new IllegalStateException("Set " + key + " to " + value + " for the waitlist-only launcher.");
            }
        });
    }
}

package com.sportscenter.management.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

/** No default SMTP destination: deployments must supply environment configuration. */
@Configuration
public class AccountMailConfig {
    @Bean
    JavaMailSender accountMailSender(@Value("${spring.mail.host:}") String host,
            @Value("${spring.mail.port:587}") int port,
            @Value("${spring.mail.username:}") String username,
            @Value("${spring.mail.password:}") String password,
            @Value("${spring.mail.properties.mail.smtp.auth:true}") boolean auth,
            @Value("${spring.mail.properties.mail.smtp.starttls.enable:true}") boolean tls) {
        var sender = new JavaMailSenderImpl() {
            @Override public void send(SimpleMailMessage... messages) {
                if (getHost() == null || getHost().isBlank()) throw new MailSendException("SMTP is not configured");
                super.send(messages);
            }
        };
        sender.setHost(host); sender.setPort(port); sender.setUsername(username); sender.setPassword(password);
        sender.setDefaultEncoding("UTF-8");
        var props = sender.getJavaMailProperties();
        props.setProperty("mail.smtp.auth", Boolean.toString(auth));
        props.setProperty("mail.smtp.starttls.enable", Boolean.toString(tls));
        props.setProperty("mail.smtp.connectiontimeout", "5000");
        props.setProperty("mail.smtp.timeout", "5000");
        props.setProperty("mail.smtp.writetimeout", "5000");
        return sender;
    }
}

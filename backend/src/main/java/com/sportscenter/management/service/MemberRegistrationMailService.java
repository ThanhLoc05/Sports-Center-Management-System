package com.sportscenter.management.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.regex.Pattern;

/** Mail sender dedicated to public signup OTP; account recovery mail remains separate. */
@Service
public class MemberRegistrationMailService {
    private static final Logger log = LoggerFactory.getLogger(MemberRegistrationMailService.class);
    private static final Pattern SMTP_REPLY_CODE = Pattern.compile(
            "(?m)^[45]\\d{2}(?:[ -][45]\\.\\d{1,3}\\.\\d{1,3})?(?=\\s|$)");

    private final JavaMailSender mailSender;
    private final String fromAddress;

    public MemberRegistrationMailService(JavaMailSender mailSender,
            @Value("${spring.mail.username:}") String fromAddress) {
        this.mailSender = mailSender;
        this.fromAddress = fromAddress;
    }

    public void send(String fullName, String targetEmail, String code, Duration lifetime) {
        if (fromAddress == null || fromAddress.isBlank()) {
            throw new MailSendException("SMTP sender address is not configured");
        }
        SimpleMailMessage mail = new SimpleMailMessage();
        mail.setFrom(fromAddress);
        mail.setTo(targetEmail);
        mail.setSubject("Mã OTP xác minh đăng ký Sportiva");
        mail.setText("Xin chào " + fullName + ",\n\n"
                + "Mã xác minh đăng ký tài khoản Sportiva của bạn là: " + code + "\n\n"
                + "Mã chỉ dùng một lần và hết hạn sau " + lifetime.toMinutes() + " phút. "
                + "Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.");
        try {
            mailSender.send(mail);
        } catch (MailAuthenticationException failure) {
            String reply = failure.getMostSpecificCause().getMessage();
            var replyCode = SMTP_REPLY_CODE.matcher(reply == null ? "" : reply);
            // Log only the SMTP status code, never the server reply or email content.
            log.warn("Signup OTP SMTP authentication failed (SMTP reply code: {}).",
                    replyCode.find() ? replyCode.group() : "unavailable");
            throw failure;
        }
    }
}

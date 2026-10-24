package com.sportscenter.auth;


import com.sportscenter.management.repository.UserRepository;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.time.LocalDateTime;
import java.util.List;

/**
 * ============================================================================
 * LỚP CẤU HÌNH BẢO MẬT TRUNG TÂM (CENTRAL SECURITY CONFIGURATION)
 * ============================================================================
 * Luồng hoạt động của Spring Security trong dự án:
 * 1. Mọi HTTP Request gửi tới server trước tiên sẽ đi qua chuỗi Filter (SecurityFilterChain).
 * 2. JwtAuthenticationFilter kiểm tra header "Authorization: Bearer <token>":
 *    - Nếu có token hợp lệ -> giải mã email, nạp UserDetails và lưu vào SecurityContextHolder.
 *    - Nếu không có token -> tiếp tục để filter bảo mật kiểm tra quyền truy cập.
 * 3. Kiểm tra phân quyền:
 *    - Các URL công khai (PermitAll): Register, Login, xem danh sách gói tập, xem lớp học.
 *    - Các URL còn lại: Bắt buộc đăng nhập (Authenticated).
 *    - Từng hàm cụ thể trong Controller: Được bảo vệ sâu hơn bởi @PreAuthorize (Method Security).
 * 4. Xử lý lỗi bảo mật:
 *    - Chưa đăng nhập (Unauthorized) -> Trả về JSON HTTP 401 chuẩn.
 *    - Đăng nhập rồi nhưng không đủ quyền (Forbidden) -> Trả về JSON HTTP 403 chuẩn.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
public class SecurityConfig {

    /**
     * Mã hóa mật khẩu người dùng bằng thuật toán băm an toàn BCrypt (độ phức tạp cao, chống brute-force).
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Tải thông tin tài khoản người dùng từ Database dựa trên email đăng nhập.
     * Kiểm tra trạng thái tài khoản: Nếu status != 'ACTIVE' -> vô hiệu hóa tài khoản (disabled).
     * 
     * [LƯU Ý QUAN TRỌNG]: Tiêm UserRepository qua tham số của @Bean method thay vì tiêm qua constructor 
     * của lớp SecurityConfig. Cách này giúp tách rời vòng đời khởi tạo của SecurityConfig và JPA Repository, 
     * tránh triệt để lỗi runtime "Parameter 0 of constructor required a bean of type UserRepository that could not be found".
     */
    @Bean
    public UserDetailsService userDetailsService(UserRepository userRepository) {
        return email -> userRepository.findByEmail(email)
                .map(user -> User.withUsername(user.getEmail())
                        .password(user.getPasswordHash())
                        .authorities("ROLE_" + user.getRole().getRoleName())
                        .disabled(!"ACTIVE".equals(user.getStatus()))
                        .build())
                .orElseThrow(() -> new UsernameNotFoundException("Không tìm thấy tài khoản với email: " + email));
    }

    /**
     * Đăng ký Filter chặn và giải mã JWT Token cho mỗi request gửi lên.
     * Tương tự, JwtService được tiêm trực tiếp qua tham số của @Bean method.
     */
    @Bean
    public JwtAuthenticationFilter jwtAuthenticationFilter(JwtService jwtService, UserDetailsService userDetailsService) {
        return new JwtAuthenticationFilter(jwtService, userDetailsService);
    }

    /**
     * CẤU HÌNH CORS (Cross-Origin Resource Sharing)
     * Cho phép các ứng dụng Frontend (React, Vue, Angular, Mobile app) ở các domain/port khác
     * (như http://localhost:3000, 5173, ...) có thể gọi được API mà không bị trình duyệt chặn.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(List.of("*")); // Chấp nhận tất cả nguồn phát request (trong môi trường dev)
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept", "X-Requested-With"));
        config.setExposedHeaders(List.of("Authorization"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    /**
     * XỬ LÝ LỖI 401 (Chưa đăng nhập / Token không hợp lệ / Hết hạn)
     * Trả về định dạng JSON chuyên nghiệp thay vì trả về trang HTML mặc định.
     */
    @Bean
    public AuthenticationEntryPoint customAuthenticationEntryPoint() {
        return (request, response, authException) -> {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");

            String jsonResponse = String.format(
                    "{\"timestamp\":\"%s\",\"status\":401,\"error\":\"Unauthorized\",\"message\":\"Yêu cầu đăng nhập hoặc token đã hết hạn / không hợp lệ.\",\"path\":\"%s\"}",
                    LocalDateTime.now(), request.getRequestURI());

            response.getWriter().write(jsonResponse);
        };
    }

    /**
     * XỬ LÝ LỖI 403 (Đã đăng nhập nhưng không đủ quyền thực hiện hành động)
     * Ví dụ: Member cố tình gọi API báo cáo doanh thu của Manager.
     */
    @Bean
    public AccessDeniedHandler customAccessDeniedHandler() {
        return (request, response, accessDeniedException) -> {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");

            String jsonResponse = String.format(
                    "{\"timestamp\":\"%s\",\"status\":403,\"error\":\"Forbidden\",\"message\":\"Bạn không có quyền truy cập chức năng này.\",\"path\":\"%s\"}",
                    LocalDateTime.now(), request.getRequestURI());

            response.getWriter().write(jsonResponse);
        };
    }

    /**
     * THIẾT LẬP CHUỖI BẢO MẬT CHÍNH (SECURITY FILTER CHAIN)
     */
    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtAuthenticationFilter jwtFilter) throws Exception {

        return http
                // Tắt CSRF vì dự án sử dụng API Stateless với JWT, không dùng Cookie Session
                .csrf(AbstractHttpConfigurer::disable)
                // Kích hoạt cấu hình CORS đã định nghĩa ở trên
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                // Chế độ Stateless: Server không lưu session, mỗi request phải tự gửi JWT
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Bắt và trả về JSON chuẩn cho lỗi 401 và 403
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(customAuthenticationEntryPoint())
                        .accessDeniedHandler(customAccessDeniedHandler()))
                // PHÂN QUYỀN URL TẦNG HTTP:
                .authorizeHttpRequests(authorize -> authorize
                        // 1. Cho phép tất cả request OPTIONS (Preflight check của trình duyệt)
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        // 2. Các API Công khai: Đăng ký, Đăng nhập, Endpoint lỗi nội bộ
                        .requestMatchers("/api/v1/users/register/**", "/api/v1/users/login/**", "/error").permitAll()
                        // 3. Khách có thể xem danh sách lớp học và danh sách gói tập công khai
                        .requestMatchers(HttpMethod.GET, "/api/v1/classes/**", "/api/v1/memberships/packages/**",
                                "/api/v1/sports", "/api/v1/rooms", "/api/v1/feedbacks/coach/**", "/api/v1/feedbacks/class/**").permitAll()
                        // 4. Tài liệu Swagger/OpenAPI (nếu có dùng)
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        // 5. Tất cả các endpoint còn lại đều phải đăng nhập (có JWT token hợp lệ)
                        .anyRequest().authenticated())
                // Gắn JwtAuthenticationFilter vào trước UsernamePasswordAuthenticationFilter
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }
}

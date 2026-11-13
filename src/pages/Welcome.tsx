import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  Dumbbell,
  Menu,
  MessageCircle,
  Pause,
  Play,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { Button } from "../components/ui";
import { useAuth } from "../lib/auth";
import "../styles-welcome.css";

const media = "/media/landing";
const sections = [
  ["tinh-nang", "Tính năng"],
  ["bo-mon", "Bộ môn"],
  ["cach-hoat-dong", "Cách hoạt động"],
] as const;

// Số liệu minh họa được giữ riêng để trang công khai không cần đọc dữ liệu hội viên.
const highlights = [
  ["320", "Thành viên"],
  ["24", "Lớp học"],
  ["48", "Buổi tập mỗi tuần"],
  ["860", "Lượt điểm danh mỗi tháng"],
] as const;
const features = [
  {
    icon: Users,
    title: "Thành viên",
    description: "Cập nhật hồ sơ và mục tiêu tập luyện.",
  },
  {
    icon: CreditCard,
    title: "Gói tập",
    description: "Xem thời hạn, đăng ký hoặc gia hạn gói.",
  },
  {
    icon: Dumbbell,
    title: "Lớp học",
    description: "Tìm lớp theo bộ môn và huấn luyện viên.",
  },
  {
    icon: CalendarDays,
    title: "Lịch hoạt động",
    description: "Xem giờ học và sắp xếp lịch trong tuần.",
  },
  {
    icon: Ticket,
    title: "Đăng ký lớp",
    description: "Đặt chỗ hoặc hủy đăng ký khi đổi lịch.",
  },
  {
    icon: ClipboardCheck,
    title: "Điểm danh",
    description: "Xem lại những buổi tập bạn đã tham gia.",
  },
  {
    icon: MessageCircle,
    title: "Đánh giá",
    description: "Chia sẻ trải nghiệm sau buổi tập.",
  },
];
const disciplines = [
  {
    title: "Yoga",
    image: "yoga",
    alt: "Học viên chống tay trên thảm, giữ tư thế thăng bằng nghiêng.",
    detail: "Hơi thở & thăng bằng",
  },
  {
    title: "Fitness",
    image: "fitness",
    alt: "Học viên tập với tạ tay trước gương trong phòng tập.",
    detail: "Sức mạnh & sức bền",
  },
  {
    title: "Pilates",
    image: "pilates",
    alt: "Học viên nghiêng người kéo giãn trên máy Pilates Reformer.",
    detail: "Kiểm soát & linh hoạt",
  },
];
const steps = [
  [
    "Đăng nhập",
    "Dùng tài khoản Sportiva của bạn hoặc đăng ký tài khoản thành viên từ trang đăng nhập.",
  ],
  ["Chọn gói tập", "Xem quyền lợi, chọn gói phù hợp và hoàn tất thanh toán."],
  [
    "Đặt lịch đến tập",
    "Khi gói có hiệu lực, chọn lớp còn chỗ và xem lại buổi học trong lịch cá nhân.",
  ],
] as const;

function Hero() {
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [videoFailed, setVideoFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const player = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Theo dõi cả khi người xem đổi cài đặt hệ thống lúc trang đang mở.
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  const showVideo = !reducedMotion && !videoFailed;
  async function togglePlayback() {
    const video = player.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    try {
      await video.play();
    } catch {
      setVideoFailed(true);
    }
  }

  return (
    <section className="welcome-hero" aria-labelledby="welcome-title">
      {/* Poster nằm dưới video. Khi giảm chuyển động, trình duyệt chỉ tải poster. */}
      <div className="welcome-hero-media" aria-hidden="true">
        {showVideo && (
          <video
            ref={player}
            src={media + "/hero.mp4"}
            poster={media + "/hero-poster.webp"}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => setVideoFailed(true)}
          />
        )}
      </div>
      <div className="welcome-wrap welcome-hero-inner">
        <h1 id="welcome-title">
          Tập theo nhịp
          <br />
          <em>của bạn.</em>
        </h1>
        <p>
          Chọn bộ môn yêu thích, đặt lịch tập và theo dõi từng buổi cùng
          Sportiva.
        </p>
        <div className="welcome-actions">
          <Link className="btn welcome-button-light" to="/login">
            Đăng nhập <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <a className="btn welcome-button-outline" href="#bo-mon">
            Khám phá bộ môn <ArrowDown size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
      {showVideo && (
        <Button
          type="button"
          variant="ghost"
          className="welcome-playback"
          aria-label={playing ? "Tạm dừng video nền" : "Phát video nền"}
          title={playing ? "Tạm dừng video nền" : "Phát video nền"}
          onClick={togglePlayback}
        >
          {playing ? (
            <Pause aria-hidden="true" size={17} />
          ) : (
            <Play aria-hidden="true" size={17} />
          )}
        </Button>
      )}
    </section>
  );
}

function WelcomeContent() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggle = useRef<HTMLButtonElement>(null);
  const page = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Chỉ tạo hiệu ứng lúc khối đi vào màn hình. Nội dung vẫn đọc được khi thiếu observer.
    if (!page.current || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("welcome-in-view");
          observer.unobserve(entry.target);
        }
      }
    });
    page.current
      .querySelectorAll("[data-welcome-reveal]")
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="welcome" ref={page} id="dau-trang">
      <a className="skip-link" href="#noi-dung">
        Đến nội dung chính
      </a>
      <header
        className="welcome-header"
        onKeyDown={(event) => {
          if (event.key === "Escape" && menuOpen) {
            setMenuOpen(false);
            menuToggle.current?.focus();
          }
        }}
      >
        <div className="welcome-wrap welcome-bar">
          <a
            className="brand"
            href="#dau-trang"
            aria-label="Sportiva, đầu trang"
          >
            <span className="brand-symbol">
              <Activity size={24} aria-hidden="true" />
            </span>
            sportiva<span className="brand-dot">.</span>
          </a>

          <Link to="/login" className="btn btn-primary welcome-nav-login">
            Đăng nhập <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <button
            type="button"
            className="welcome-menu"
            ref={menuToggle}
            aria-controls="welcome-navigation"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
          <nav
            id="welcome-navigation"
            aria-label="Điều hướng giới thiệu"
            className={menuOpen ? "welcome-nav is-open" : "welcome-nav"}
          >
            {sections.map(([id, label]) => (
              <a key={id} href={"#" + id} onClick={() => setMenuOpen(false)}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main id="noi-dung" tabIndex={-1}>
        <Hero />
        <section className="welcome-highlights" aria-label="Số liệu minh họa">
          <div className="welcome-wrap">
            <dl>
              {highlights.map(([number, label]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{number}</dd>
                </div>
              ))}
            </dl>
            <p>Số liệu minh họa</p>
          </div>
        </section>
        <section
          id="tinh-nang"
          className="welcome-wrap welcome-section welcome-feature-section"
          tabIndex={-1}
        >
          <div className="welcome-section-heading" data-welcome-reveal>
            <h2>Tính năng</h2>
            <p>
              Từ lúc chọn gói đến sau buổi tập, bạn có thể quản lý lịch và hoạt
              động của mình tại một nơi.
            </p>
          </div>
          <ul className="welcome-features">
            {features.map(({ icon: Icon, title, description }) => (
              <li key={title}>
                <Icon size={23} strokeWidth={1.7} aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="welcome-sports" id="bo-mon" tabIndex={-1}>
          <div className="welcome-wrap welcome-section">
            <h2 data-welcome-reveal>Khám phá bộ môn</h2>
            <div className="welcome-sport-grid">
              {disciplines.map((sport) => (
                <figure key={sport.image} className="welcome-sport">
                  <div>
                    <img
                      width="840"
                      height="560"
                      loading="lazy"
                      decoding="async"
                      src={media + "/" + sport.image + ".webp"}
                      alt={sport.alt}
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                  </div>
                  <figcaption>
                    <h3>{sport.title}</h3>
                    <p>{sport.detail}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
        <section
          className="welcome-wrap welcome-section"
          id="cach-hoat-dong"
          tabIndex={-1}
        >
          <h2 data-welcome-reveal>Cách hoạt động</h2>
          <ol className="welcome-steps">
            {steps.map(([title, detail], i) => (
              <li key={title}>
                <span aria-hidden="true">0{i + 1}</span>
                <h3>{title}</h3>
                <p>{detail}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="welcome-invite">
          <div className="welcome-wrap">
            <h2>Sẵn sàng cho buổi tập tới?</h2>
            <Link to="/login" className="btn btn-primary">
              Đăng nhập <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <footer className="welcome-wrap welcome-footer">
        © 2026 Sportiva Center
      </footer>
    </div>
  );
}

export default function Welcome() {
  // Dùng phiên của AuthProvider để người đã đăng nhập đi thẳng về Tổng quan.
  const { session } = useAuth();
  return session ? <Navigate to="/" replace /> : <WelcomeContent />;
}

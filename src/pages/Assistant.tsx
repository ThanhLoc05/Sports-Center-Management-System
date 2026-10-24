/**
 * FLOW 5/6 TÙY CHỌN — TRỢ LÝ VÀ MẪU BUỔI TẬP ĐANG Ở MỨC DEMO.
 * Trả lời dựa trên từ khóa và dữ liệu mẫu, không gọi mô hình AI hay dịch vụ AI bên ngoài.
 * Việc có giao diện chat không chứng minh đã tích hợp AI thật.
 */
import { useRef, useState, useEffect } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Dumbbell,
  Leaf,
  MessageCircle,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { readDemo } from "../lib/demo";
import { api, updateDemo } from "../lib/api";
import { useClasses } from "../lib/hooks";
import { dateLabel, dateTimeLocal, normalize, timeLabel } from "../lib/utils";
import {
  Avatar,
  Button,
  DemoOnly,
  Field,
  FormModal,
  Modal,
  Notice,
  PageHeader,
  useToast,
} from "../components/ui";
interface Message {
  role: "assistant" | "user";
  content: string;
}
export default function Assistant() {
  const { session } = useAuth();
  const demo = session!.mode === "demo";
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recommend, setRecommend] = useState(false);
  const [plan, setPlan] = useState("");
  const [goal, setGoal] = useState("Vận động đều đặn");
  const classes = useClasses();
  const bottom = useRef<HTMLDivElement>(null);
  const toast = useToast();
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);
  /**
   * Chỉ hoạt động trong demo: chuẩn hóa câu hỏi, so từ khóa rồi tạo câu trả lời
   * từ lịch/gói mẫu. busy ngăn gửi chồng; catch báo lỗi, finally bỏ trạng thái chờ.
   * Không có lời gọi AI/LLM trong hàm này.
   */
  async function send(input: string) {
    if (!demo || busy || !input.trim()) return;
    setText("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: input.trim() }]);
    let answer = "";
    const q = normalize(input);
    try {
      if (q.includes("lich") || q.includes("lop")) {
        const b = await api.bookings(session!.user.id);
        const booked = (classes.data || [])
          .filter(
            (c) =>
              c.status === "SCHEDULED" &&
              b.some((x) => x.classId === c.id && x.status === "BOOKED"),
          )
          .slice(0, 5);
        answer = booked.length
          ? `Đây là các lớp đã đăng ký của bạn trong dữ liệu demo:\n\n${booked.map((c) => `• ${c.className} — ${dateLabel(c.scheduleTime)}, ${timeLabel(c.scheduleTime)}`).join("\n")}\n\nBạn có thể xem đầy đủ và hủy đăng ký trong mục Đăng ký lớp.`
          : "Bạn chưa có lớp đã đăng ký trong dữ liệu demo. Mở mục Lớp học để khám phá lịch tập và đăng ký nhé.";
      } else if (
        q.includes("goi") ||
        q.includes("gia") ||
        q.includes("dich vu")
      ) {
        answer = `Các gói demo tại Sportiva:\n\n${readDemo()
          .packages.map(
            (p) =>
              `• ${p.name}: ${p.price.toLocaleString("vi-VN")}đ / ${p.durationDays} ngày — ${p.description}`,
          )
          .join(
            "\n",
          )}\n\nXem chi tiết quyền lợi trong mục Gói thành viên. Giá trên chỉ là dữ liệu minh họa.`;
      } else if (q.includes("gio") || q.includes("mo cua")) {
        answer =
          "Giờ mở cửa chưa có trong API hoặc cấu hình trung tâm. Bạn có thể gửi yêu cầu ở mục Hỗ trợ để lễ tân cung cấp thông tin chính xác.";
      } else if (
        q.includes("bai tap") ||
        q.includes("tap luyen") ||
        q.includes("goi y")
      ) {
        answer =
          "Bạn có thể dùng nút “Gợi ý buổi tập” để tạo mẫu theo mục tiêu, mức độ và thời gian rảnh. Đây là mẫu theo quy tắc demo, chưa gọi mô hình AI và chưa sử dụng lịch sử sức khỏe. Hãy trao đổi với HLV để điều chỉnh phù hợp.";
      } else {
        answer =
          "Mình là trợ lý demo theo quy tắc của Sportiva. Mình có thể tra lịch lớp đã đăng ký của bạn, giới thiệu các gói demo hoặc tạo mẫu buổi tập. Với yêu cầu khác, hãy gửi ở mục Hỗ trợ để trung tâm tiếp nhận.";
      }
      setMessages((m) => [...m, { role: "assistant", content: answer }]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Không thể tra cứu.", "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="A LITTLE GUIDANCE GOES A LONG WAY"
        title="Trợ lý tập luyện"
        description="Thêm cảm hứng cho buổi tập. Thêm rõ ràng cho mỗi lựa chọn."
        actions={
          <Button disabled={!demo} onClick={() => setRecommend(true)}>
            <Sparkles size={17} />
            Gợi ý buổi tập
          </Button>
        }
      />
      <DemoOnly>
        {demo
          ? "Bản demo theo quy tắc, chưa kết nối AI. Câu trả lời được tạo từ dữ liệu minh họa; không gọi dịch vụ AI bên ngoài."
          : "Backend chưa có endpoint AI assistant / workout recommendation. Không có API key nào được đặt ở frontend."}
      </DemoOnly>
      <div className="assistant-layout">
        <section className="chat-panel">
          <div className="chat-heading">
            <span className="assistant-avatar">
              <Sparkles size={21} />
            </span>
            <div>
              <strong>Sportiva Companion</strong>
              <small>
                <span className="status-dot" />
                {demo ? "Trợ lý demo · theo quy tắc" : "Đang chờ tích hợp AI"}
              </small>
            </div>
            <button className="subtle-link" onClick={() => setMessages([])}>
              <Plus size={15} />
              Cuộc trò chuyện mới
            </button>
          </div>
          <div className="chat-content">
            {!messages.length ? (
              <div className="chat-welcome">
                <span className="chat-welcome-icon">
                  <Sparkles size={34} strokeWidth={1.3} />
                </span>
                <span className="eyebrow">YOUR MOVEMENT COMPANION</span>
                <h2>
                  Hôm nay bạn muốn
                  <br />
                  bắt đầu từ đâu?
                </h2>
                <p>
                  Cùng tìm một chút cảm hứng cho hành trình tập luyện của bạn.
                </p>
                <div className="chat-suggestions">
                  {[
                    {
                      icon: CalendarDays,
                      text: "Xem lịch tập đã đăng ký của tôi",
                    },
                    {
                      icon: CreditCardIcon,
                      text: "Trung tâm có những gói tập nào?",
                    },
                    { icon: Dumbbell, text: "Gợi ý bài tập phù hợp với tôi" },
                    { icon: MessageCircle, text: "Tôi cần hỗ trợ dịch vụ" },
                  ].map((s) => (
                    <button
                      key={s.text}
                      disabled={!demo}
                      onClick={() => void send(s.text)}
                    >
                      <s.icon size={19} />
                      <span>{s.text}</span>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="message-list">
                {messages.map((m, i) => (
                  <div className={`chat-message ${m.role}`} key={i}>
                    {m.role === "assistant" ? (
                      <span className="assistant-avatar">
                        <Sparkles size={18} />
                      </span>
                    ) : (
                      <Avatar name={session!.user.fullName} size="small" />
                    )}
                    <div>
                      <span>
                        {m.role === "assistant"
                          ? "Sportiva · Demo"
                          : session!.user.fullName}
                      </span>
                      <p>{m.content}</p>
                    </div>
                  </div>
                ))}
                <div ref={bottom} />
              </div>
            )}
          </div>
          <form
            className="chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <label className="sr-only" htmlFor="chat-message">
              Tin nhắn
            </label>
            <input
              id="chat-message"
              value={text}
              disabled={!demo || busy}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              placeholder={
                demo
                  ? "Hỏi về lịch tập, gói tập hoặc dịch vụ..."
                  : "Tính năng chờ API backend"
              }
            />
            <button
              aria-label="Gửi tin nhắn"
              type="submit"
              disabled={!demo || !text.trim() || busy}
            >
              <Send size={19} />
            </button>
          </form>
          <p className="chat-disclaimer">
            Gợi ý demo mang tính tham khảo. HLV là người điều chỉnh kế hoạch phù
            hợp cho bạn.
          </p>
        </section>
        <aside className="assistant-sidebar">
          <div className="assistant-info-card">
            <Leaf size={27} strokeWidth={1.5} />
            <h3>
              Lắng nghe cơ thể.
              <br />
              Tìm nhịp của riêng bạn.
            </h3>
            <p>Bắt đầu vừa sức, duy trì đều đặn và dành thời gian phục hồi.</p>
            <Button
              variant="secondary"
              disabled={!demo}
              onClick={() => setRecommend(true)}
            >
              Tạo mẫu buổi tập
              <ArrowUpRight size={15} />
            </Button>
          </div>
          <div className="assistant-scope">
            <ShieldCheck size={20} />
            <strong>Minh bạch từ đầu</strong>
            <p>
              Không chẩn đoán, không sử dụng dữ liệu sức khỏe riêng tư, không
              giả lập kết nối AI thành công.
            </p>
            <span>LOCAL DEMO · NO AI PROVIDER</span>
          </div>
        </aside>
      </div>
      {recommend && (
        <FormModal
          title="Tạo mẫu buổi tập"
          description="Gợi ý theo quy tắc demo, chưa phải đề xuất từ mô hình AI."
          onClose={() => setRecommend(false)}
          submitLabel="Tạo gợi ý"
          onSubmit={async (d) => {
            const chosenGoal = String(d.get("goal")),
              level = String(d.get("level")),
              duration = Number(d.get("duration"));
            setGoal(chosenGoal);
            const rounds = level === "Mới bắt đầu" ? 2 : 3;
            const exercises =
              chosenGoal === "Cải thiện linh hoạt"
                ? [
                    "Cat-cow · 8 lần",
                    "Bird-dog · 8 lần mỗi bên",
                    "Giãn cơ hông · 30 giây mỗi bên",
                  ]
                : chosenGoal === "Tăng sức mạnh"
                  ? [
                      "Squat trọng lượng cơ thể · 8–12 lần",
                      "Chống đẩy tường · 8–12 lần",
                      "Glute bridge · 12 lần",
                    ]
                  : [
                      "Đi bộ nhanh tại chỗ · 3 phút",
                      "Step touch · 2 phút",
                      "Squat nhẹ · 8 lần",
                    ];
            setPlan(
              `Dự kiến khoảng ${duration} phút, điều chỉnh theo khả năng.\nKhởi động nhẹ · 5 phút\n${exercises.map((e) => `${e} × ${rounds} hiệp`).join("\n")}\nGiãn cơ và thả lỏng · 5 phút`,
            );
          }}
        >
          <Field label="Mục tiêu">
            <select name="goal">
              <option>Vận động đều đặn</option>
              <option>Tăng sức mạnh</option>
              <option>Cải thiện linh hoạt</option>
            </select>
          </Field>
          <Field label="Trình độ">
            <select name="level">
              <option>Mới bắt đầu</option>
              <option>Đã có kinh nghiệm</option>
            </select>
          </Field>
          <Field label="Thời gian dự kiến">
            <select name="duration">
              <option value="20">20 phút</option>
              <option value="30">30 phút</option>
              <option value="45">45 phút</option>
            </select>
          </Field>
        </FormModal>
      )}
      {plan && !recommend && (
        <Modal
          title="Mẫu buổi tập tham khảo"
          description={goal}
          onClose={() => setPlan("")}
        >
          <div className="form-fields">
            <pre className="suggested-workout">{plan}</pre>
            <Notice>
              Mẫu theo quy tắc demo. Trao đổi cùng HLV để điều chỉnh phù hợp.
            </Notice>
          </div>
          <div className="modal-footer">
            <Button variant="secondary" onClick={() => setPlan("")}>
              Đóng
            </Button>
            {session!.user.roleName === "MEMBER" && (
              <Button
                onClick={() => {
                  updateDemo("Lưu mẫu tập demo", goal, (db) =>
                    db.plans.push({
                      id: Date.now(),
                      title: `Mẫu tập · ${goal}`,
                      memberId: session!.user.id,
                      coachId: 0,
                      goal,
                      notes:
                        "Mẫu theo quy tắc demo. Cần HLV xem lại trước khi áp dụng.",
                      exercises: plan,
                      createdAt: dateTimeLocal(),
                    }),
                  );
                  setPlan("");
                  toast("Đã lưu mẫu demo trong Kế hoạch tập luyện.");
                }}
              >
                Lưu vào kế hoạch của tôi
              </Button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function CreditCardIcon({ size = 19 }: { size?: number }) {
  return <Target size={size} />;
}

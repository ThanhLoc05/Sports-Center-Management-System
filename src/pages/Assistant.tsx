import { parseDate } from "../lib/utils";
/**
 * FLOW 5/6 — AI Gemini qua Vercel Function và tra cứu dữ liệu tại trung tâm.
 * AI chỉ nhận tin nhắn hoặc lựa chọn buổi tập; API key nằm phía máy chủ.
 * Lịch/gói vẫn tra nguồn dữ liệu ứng dụng, không để mô hình tự bịa thông tin.
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
import { useDemoData, usePermissions } from "../lib/hooks";
import { coachMembers } from "../lib/entitlements";
import { workoutSuggestion } from "../lib/recommendation";
import { askAi, getAiStatus, suggestAiWorkout } from "../lib/assistant";
import type { AiStatus } from "../lib/assistant";
import { savePlan } from "../lib/center";
import { dateLabel, dateTimeLocal, normalize, timeLabel } from "../lib/utils";
import {
  Avatar,
  Button,
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
  source?: "gemini" | "center";
}
export default function Assistant() {
  const { session } = useAuth();
  const demo = session!.mode === "demo";
  const db = useDemoData();
  const can = usePermissions();
  const [recommendMember, setRecommendMember] = useState(
    session!.user.roleName === "MEMBER" ? session!.user.id : 0,
  );
  const [recommendCoach, setRecommendCoach] = useState(
    session!.user.roleName === "COACH" ? session!.user.id : 0,
  );
  const students = db
    ? session!.user.roleName === "COACH"
      ? coachMembers(db, session!.user.id)
      : db.users.filter((u) => u.roleName === "MEMBER")
    : [];
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [statusRetry, setStatusRetry] = useState(0);
  const [assistantMode, setAssistantMode] = useState<"ai" | "center">("center");
  const [chatError, setChatError] = useState("");
  const [planModel, setPlanModel] = useState("");
  const request = useRef<AbortController | null>(null);
  const sending = useRef(false);
  const online = assistantMode === "ai" && aiStatus?.configured === true;
  // Chờ xác định nguồn trả lời trước khi nhận câu hỏi đầu tiên.
  const canChat = aiStatus !== null && (online || demo);
  const canRecommend =
    aiStatus !== null &&
    (online || demo) &&
    (!demo || session!.user.roleName === "MEMBER" || can("training.manage"));
  const planNotes = planModel
    ? "Gợi ý AI Gemini (" + planModel + "). HLV cần xem lại trước khi áp dụng."
    : "Mẫu theo quy tắc demo. Cần HLV xem lại trước khi áp dụng.";
  useEffect(() => {
    const controller = new AbortController();
    void getAiStatus(controller.signal).then((status) => {
      if (controller.signal.aborted) return;
      setAiStatus(status);
      if (status.configured) setAssistantMode("ai");
    });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, [statusRetry]);
  function changeMode(next: "ai" | "center") {
    if (sending.current) return;
    setAssistantMode(next);
    setMessages([]);
    setChatError("");
  }
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
   * AI gửi hội thoại gần nhất qua cổng riêng; tra cứu cục bộ dùng dữ liệu demo.
   * Không chuyển session/token/hồ sơ sang Google. ref chặn gửi trùng trước khi
   * React render; lỗi giữ lại câu hỏi để thử lại và không giả câu trả lời AI.
   */
  async function send(input: string) {
    if (!canChat || sending.current || !input.trim()) return;
    if (input.trim().length > 2000) {
      setChatError("Tin nhắn tối đa 2.000 ký tự.");
      return;
    }
    const previous = messages;
    const source = online ? "gemini" : "center";
    const question: Message = { role: "user", content: input.trim(), source };
    const controller = new AbortController();
    request.current = controller;
    sending.current = true;
    setChatError("");
    setText("");
    setBusy(true);
    setMessages([...previous, question]);
    let answer = "";
    const q = normalize(input);
    try {
      if (online) {
        const result = await askAi(
          [...previous.filter((m) => m.source === "gemini"), question],
          controller.signal,
        );
        if (controller.signal.aborted) return;
        answer =
          result.text +
          (result.truncated
            ? "\n\nCâu trả lời đạt giới hạn độ dài. Bạn có thể yêu cầu giải thích thêm."
            : "");
      } else if (q.includes("lich") || q.includes("lop")) {
        const member = session!.user.roleName === "MEMBER";
        const bookings = member ? await api.bookings(session!.user.id) : [];
        const booked = (classes.data || [])
          .filter(
            (c) =>
              c.status === "SCHEDULED" &&
              parseDate(c.scheduleTime) > new Date() &&
              (!member ||
                bookings.some(
                  (b) => b.classId === c.id && b.status === "BOOKED",
                )),
          )
          .sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime))
          .slice(0, 5);
        const label = member
          ? "các lớp bạn đã đăng ký"
          : session!.user.roleName === "COACH"
            ? "các lớp bạn phụ trách"
            : "các lớp sắp tới của trung tâm";
        answer = booked.length
          ? `Đây là ${label} trong bản demo:\n\n${booked.map((c) => `• ${c.className} — ${dateLabel(c.scheduleTime)}, ${timeLabel(c.scheduleTime)}`).join("\n")}\n\nMở Lịch hoạt động để xem lịch đầy đủ.`
          : `Chưa có ${label} trong thời gian sắp tới. Bạn có thể kiểm tra ở Lịch hoạt động.`;
      } else if (
        q.includes("goi") ||
        q.includes("gia") ||
        q.includes("dich vu")
      ) {
        answer = `Các gói demo tại Sportiva:\n\n${readDemo()
          .packages.filter((p) => p.status !== "INACTIVE")
          .map(
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
      setMessages([
        ...previous,
        question,
        { role: "assistant", content: answer, source },
      ]);
    } catch (e) {
      if (controller.signal.aborted) return;
      setMessages(previous);
      setText(input.trim());
      setChatError(e instanceof Error ? e.message : "Không thể tra cứu.");
    } finally {
      sending.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="A LITTLE GUIDANCE GOES A LONG WAY"
        title="Trợ lý tập luyện"
        description="Thêm cảm hứng cho buổi tập. Thêm rõ ràng cho mỗi lựa chọn."
        actions={
          <Button
            disabled={!canRecommend || busy}
            onClick={() => setRecommend(true)}
          >
            <Sparkles size={17} />
            Gợi ý buổi tập
          </Button>
        }
      />
      <div className="assistant-mode" role="group" aria-label="Chế độ trợ lý">
        <Button
          variant={assistantMode === "ai" ? "primary" : "secondary"}
          aria-pressed={assistantMode === "ai"}
          disabled={!aiStatus?.configured || busy}
          onClick={() => changeMode("ai")}
        >
          <Sparkles size={16} />
          AI Gemini
        </Button>
        <Button
          variant={assistantMode === "center" ? "primary" : "secondary"}
          aria-pressed={assistantMode === "center"}
          disabled={busy}
          onClick={() => changeMode("center")}
        >
          <CalendarDays size={16} />
          Tra cứu tại trung tâm
        </Button>
        <span>
          {aiStatus === null
            ? "Đang kiểm tra dịch vụ AI…"
            : aiStatus.configured
              ? "Gemini đã được cấu hình"
              : "AI chưa sẵn sàng trên môi trường này"}
        </span>
      </div>
      {aiStatus?.configured === false && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setAiStatus(null);
            setStatusRetry((n) => n + 1);
          }}
        >
          Thử kết nối AI
        </Button>
      )}
      <Notice>
        {online
          ? "Tin nhắn AI được gửi đến Google Gemini. Không nhập mật khẩu hoặc thông tin sức khỏe riêng tư. Ứng dụng không tự gửi hồ sơ, email hay nhận xét của HLV."
          : demo
            ? "Tra cứu lịch và gói từ dữ liệu demo trên trình duyệt. Mẫu buổi tập ở chế độ này được tạo theo quy tắc, không gọi AI."
            : "Tra cứu trò chuyện chưa có API nghiệp vụ. Chọn AI Gemini để hỏi về bài tập; lịch và gói thật xem trong các mục tương ứng."}
      </Notice>
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
                {online
                  ? "AI Gemini · gợi ý tập luyện"
                  : "Tra cứu tại trung tâm"}
              </small>
            </div>
            <button
              className="subtle-link"
              disabled={busy}
              onClick={() => {
                setMessages([]);
                setChatError("");
              }}
            >
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
                  {(online
                    ? [
                        {
                          icon: Dumbbell,
                          text: "Gợi ý buổi tập 20 phút cho người mới bắt đầu",
                        },
                        {
                          icon: Leaf,
                          text: "Hướng dẫn khởi động trước khi tập",
                        },
                        {
                          icon: Target,
                          text: "Làm sao duy trì thói quen tập luyện?",
                        },
                        {
                          icon: MessageCircle,
                          text: "Sau buổi tập nên phục hồi thế nào?",
                        },
                      ]
                    : [
                        {
                          icon: CalendarDays,
                          text: "Xem lịch tập đã đăng ký của tôi",
                        },
                        {
                          icon: CreditCardIcon,
                          text: "Trung tâm có những gói tập nào?",
                        },
                        {
                          icon: Dumbbell,
                          text: "Gợi ý bài tập phù hợp với tôi",
                        },
                        { icon: MessageCircle, text: "Tôi cần hỗ trợ dịch vụ" },
                      ]
                  ).map((s) => (
                    <button
                      key={s.text}
                      disabled={!canChat || busy}
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
                          ? m.source === "gemini"
                            ? "Sportiva · AI Gemini"
                            : "Sportiva · Tra cứu"
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
          {busy && (
            <p className="assistant-progress" role="status">
              {online ? "Gemini đang trả lời…" : "Đang tra cứu…"}
            </p>
          )}
          {chatError && (
            <p className="form-error assistant-progress" role="alert">
              {chatError}
            </p>
          )}
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
              disabled={!canChat || busy}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              placeholder={
                online
                  ? "Hỏi Gemini về bài tập, kỹ thuật hoặc phục hồi..."
                  : demo
                    ? "Hỏi về lịch tập, gói tập hoặc dịch vụ..."
                    : "Chọn AI Gemini để trò chuyện về tập luyện"
              }
            />
            <button
              aria-label="Gửi tin nhắn"
              type="submit"
              disabled={!canChat || !text.trim() || busy}
            >
              <Send size={19} />
            </button>
          </form>
          <p className="chat-disclaimer">
            {online
              ? "AI có thể trả lời chưa chính xác. "
              : "Gợi ý demo mang tính tham khảo. "}
            HLV là người điều chỉnh kế hoạch phù hợp cho bạn.
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
              disabled={!canRecommend || busy}
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
              AI hỗ trợ gợi ý bài tập. Lịch lớp, giá gói và thanh toán vẫn do dữ
              liệu của trung tâm quyết định. Kế hoạch cần HLV xem lại.
            </p>
            <span>
              {online ? "GOOGLE GEMINI · AI" : "TRA CỨU · DỮ LIỆU TRUNG TÂM"}
            </span>
          </div>
        </aside>
      </div>
      {recommend && (
        <FormModal
          title="Tạo mẫu buổi tập"
          description={
            online
              ? "Gemini nhận mục tiêu, trình độ, thời lượng và số buổi đã ghi kết quả; không nhận tên hay nhận xét chi tiết."
              : "Mô phỏng theo mục tiêu, trình độ và lịch sử demo; chưa gọi mô hình AI."
          }
          onClose={() => setRecommend(false)}
          submitLabel="Tạo gợi ý"
          onSubmit={async (d) => {
            const chosenGoal = String(d.get("goal")),
              level = String(d.get("level")),
              duration = Number(d.get("duration"));
            setGoal(chosenGoal);
            if (!db && !online) throw new Error("Dịch vụ AI chưa sẵn sàng.");
            const target =
              session!.user.roleName === "MEMBER"
                ? session!.user.id
                : Number(d.get("recommendMember")) || 0;
            setRecommendMember(target);
            setRecommendCoach(
              session!.user.roleName === "COACH"
                ? session!.user.id
                : Number(d.get("recommendCoach")) || 0,
            );

            // Kiểm tra phạm vi học viên ngay trong ứng dụng trước khi đếm buổi.
            // Mẫu có tên/nhận xét chỉ dùng cục bộ, không đưa chuỗi này lên Google.
            const localPlan = db
              ? workoutSuggestion(
                  db,
                  session!,
                  target,
                  chosenGoal,
                  level,
                  duration,
                )
              : "";
            if (online) {
              const controller = new AbortController();
              request.current = controller;
              const result = await suggestAiWorkout(
                {
                  goal: chosenGoal,
                  level,
                  duration,
                  completedSessions:
                    db?.logs.filter((log) => log.memberId === target).length ||
                    0,
                },
                controller.signal,
              );
              if (controller.signal.aborted) return;
              setPlanModel(result.model);
              setPlan(
                result.text +
                  (result.truncated
                    ? "\n\nGợi ý đã đạt giới hạn độ dài; cần HLV hoàn thiện trước khi áp dụng."
                    : ""),
              );
            } else {
              setPlanModel("");
              setPlan(localPlan);
            }
          }}
        >
          {demo && session!.user.roleName !== "MEMBER" && (
            <Field label="Học viên nhận gợi ý">
              <select
                name="recommendMember"
                required
                defaultValue={recommendMember || ""}
              >
                <option value="" disabled>
                  Chọn học viên trong phạm vi phụ trách
                </option>
                {students.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} · {u.fitnessGoals || "Chưa có mục tiêu"}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {demo &&
            session!.user.roleName !== "MEMBER" &&
            session!.user.roleName !== "COACH" && (
              <Field label="HLV xem xét gợi ý">
                <select
                  name="recommendCoach"
                  required
                  defaultValue={recommendCoach || ""}
                >
                  <option value="" disabled>
                    Chọn HLV
                  </option>
                  {db?.users
                    .filter((u) => u.roleName === "COACH")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                </select>
              </Field>
            )}
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
              {planNotes}
              {!demo &&
                " Lưu kế hoạch vào tài khoản cần API kế hoạch tập luyện."}
            </Notice>
          </div>
          <div className="modal-footer">
            <Button variant="secondary" onClick={() => setPlan("")}>
              Đóng
            </Button>
            {demo && session!.user.roleName === "MEMBER" && (
              <Button
                onClick={() => {
                  updateDemo("Lưu mẫu tập demo", goal, (db) =>
                    db.plans.push({
                      id: Date.now(),
                      title: `Mẫu tập · ${goal}`,
                      memberId: session!.user.id,
                      coachId: 0,
                      goal,
                      notes: planNotes,
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
            {demo &&
              session!.user.roleName !== "MEMBER" &&
              can("training.manage") && (
                <Button
                  onClick={() => {
                    try {
                      savePlan({
                        title: `Mẫu tập · ${goal}`,
                        memberId: recommendMember,
                        coachId: recommendCoach,
                        goal,
                        notes: planNotes,
                        exercises: plan,
                      });
                      setPlan("");
                      toast("Đã giao kế hoạch demo và thông báo học viên.");
                    } catch (e) {
                      toast(
                        e instanceof Error
                          ? e.message
                          : "Không lưu được kế hoạch.",
                        "error",
                      );
                    }
                  }}
                >
                  HLV áp dụng thành kế hoạch
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

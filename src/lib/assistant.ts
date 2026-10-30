/**
 * Frontend chỉ gọi cổng cùng website; API key không đi qua trình duyệt.
 * Luồng: Assistant.tsx → /api/assistant (Vercel Function) → Google Gemini.
 * Không dùng api.request() vì đường dẫn này tách khỏi /api/v1 của Spring Boot.
 */
export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}
export interface AiStatus {
  configured: boolean;
  provider: "gemini";
  model: string | null;
}
export interface AiAnswer {
  text: string;
  provider: "gemini";
  model: string;
  truncated: boolean;
}
export interface WorkoutRequest {
  goal: string;
  level: string;
  duration: number;
  completedSessions: number;
}
export async function getAiStatus(signal?: AbortSignal): Promise<AiStatus> {
  // Status không được treo vô hạn: hết 15 giây thì vẫn cho dùng tra cứu cục bộ.
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch("/api/assistant", {
      signal: controller.signal,
      cache: "no-store",
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      throw new Error();
    const status = await response.json();
    return {
      configured: status.configured === true && status.provider === "gemini",
      provider: "gemini",
      model: typeof status.model === "string" ? status.model : null,
    };
  } catch {
    // Vite thuần/BE chưa có cổng Vercel: hiển thị chưa cấu hình, không giả kết nối.
    return { configured: false, provider: "gemini", model: null };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
async function generate(body: object, signal?: AbortSignal): Promise<AiAnswer> {
  let response: Response;
  try {
    response = await fetch("/api/assistant", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Không kết nối được AI. Vui lòng thử lại.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Dịch vụ AI chưa sẵn sàng.",
    );
  if (
    data?.provider !== "gemini" ||
    typeof data?.text !== "string" ||
    !data.text.trim() ||
    typeof data?.model !== "string"
  )
    throw new Error("Phản hồi AI không hợp lệ.");
  return { ...data, truncated: data.truncated === true };
}
export function askAi(messages: AiMessage[], signal?: AbortSignal) {
  // Giữ ngữ cảnh gần nhất trong giới hạn máy chủ. Chỉ có hội thoại AI do người dùng gửi.
  const selected = messages
    .slice(-8)
    .map(({ role, content }) => ({ role, content: content.slice(0, 2000) }));
  while (
    selected.length > 1 &&
    selected.reduce((n, m) => n + m.content.length, 0) > 8000
  )
    selected.shift();
  return generate({ action: "chat", messages: selected }, signal);
}
export function suggestAiWorkout(input: WorkoutRequest, signal?: AbortSignal) {
  // Chỉ gửi mục tiêu/chế độ/thời lượng/số buổi. Không gửi tên, email, ID hay nhận xét HLV.
  return generate(
    {
      action: "workout",
      goal: input.goal,
      level: input.level,
      duration: input.duration,
      completedSessions: input.completedSessions,
    },
    signal,
  );
}

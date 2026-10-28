import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { demoSession, readDemo } from "../lib/demo";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../components/ui";
import { askAi, getAiStatus } from "../lib/assistant";
import Assistant from "../pages/Assistant";
import type { Role } from "../lib/types";
const ready = { configured: true, provider: "gemini", model: "gemini-test" };
const reply = {
  text: "Khởi động nhẹ trong 5 phút rồi tập squat vừa sức.",
  provider: "gemini",
  model: "gemini-test",
  truncated: false,
};
const originalScroll = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  if (originalScroll)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScroll,
    );
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});
function wrap(role: Role = "MEMBER", apiMode = false) {
  const session = demoSession(role);
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify({ ...session, mode: apiMode ? "api" : "demo" }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    ...render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ToastProvider>
            <MemoryRouter>
              <Assistant />
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    ),
    client,
  };
}
const mockFetch = (
  post: () => Promise<Response> = async () => Response.json(reply),
) => {
  const mock = vi.fn(async (_url: unknown, init?: RequestInit) =>
    init?.method === "POST" ? post() : Response.json(ready),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
};
describe("Gemini qua cổng riêng Vercel", () => {
  it("allows reconnecting after the status check initially fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ ...ready, configured: false }))
        .mockResolvedValueOnce(Response.json(ready)),
    );
    const { client } = wrap();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Thử kết nối AI" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "AI Gemini" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(
      screen.queryByRole("button", { name: "Thử kết nối AI" }),
    ).not.toBeInTheDocument();
    client.clear();
  });

  it("waits for readiness before enabling the first question", async () => {
    let resolveStatus!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) =>
        init?.method === "POST"
          ? Response.json(reply)
          : new Promise<Response>((resolve) => {
              resolveStatus = resolve;
            }),
      ),
    );
    const { client } = wrap();
    expect(screen.getByLabelText("Tin nhắn")).toBeDisabled();
    resolveStatus(Response.json(ready));
    await waitFor(() =>
      expect(screen.getByLabelText("Tin nhắn")).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "AI Gemini" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    client.clear();
  });

  it("does not mistake SPA HTML or missing configuration for working AI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html>app</html>", {
            headers: { "Content-Type": "text/html" },
          }),
      ),
    );
    expect((await getAiStatus()).configured).toBe(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ...ready, configured: false })),
    );
    expect((await getAiStatus()).configured).toBe(false);
  });
  it("sends a bounded history and no session fields to the same-origin endpoint", async () => {
    const fetch = mockFetch();
    const history = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 ? ("assistant" as const) : ("user" as const),
      content: "x".repeat(3000),
    }));
    history.push({ role: "user", content: "Hỏi tiếp" });
    await askAi(history);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/assistant");
    const body = JSON.parse(init!.body as string);
    expect(body.messages.length).toBeLessThanOrEqual(8);
    expect(
      body.messages.every((m: { content: string }) => m.content.length <= 2000),
    ).toBe(true);
    expect(
      body.messages.reduce(
        (n: number, m: { content: string }) => n + m.content.length,
        0,
      ),
    ).toBeLessThanOrEqual(8000);
    expect(body.messages.at(-1).content).toBe("Hỏi tiếp");
    expect(init!.headers).toEqual({ "Content-Type": "application/json" });
  });
  it("shows a real AI answer with provider provenance", async () => {
    const fetch = mockFetch();
    const { client } = wrap();
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "AI Gemini" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    await user.type(
      screen.getByLabelText("Tin nhắn"),
      "Tôi mới tập, khởi động thế nào?",
    );
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    expect(await screen.findByText(reply.text)).toBeVisible();
    expect(screen.getByText("Sportiva · AI Gemini")).toBeVisible();
    const post = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
    const payload = JSON.parse(post[1]!.body as string);
    expect(payload).toEqual({
      action: "chat",
      messages: [{ role: "user", content: "Tôi mới tập, khởi động thế nào?" }],
    });
    expect(JSON.stringify(payload)).not.toContain("member1@sportiva.demo");
    client.clear();
  });
  it("preserves the draft and displays provider quota errors without fake fallback", async () => {
    mockFetch(async () =>
      Response.json({ error: "Gemini hết hạn mức." }, { status: 429 }),
    );
    const { client } = wrap();
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "AI Gemini" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    await user.type(screen.getByLabelText("Tin nhắn"), "Bài tập 20 phút");
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Gemini hết hạn mức.",
    );
    expect(screen.getByLabelText("Tin nhắn")).toHaveValue("Bài tập 20 phút");
    expect(screen.queryByText("Sportiva · AI Gemini")).not.toBeInTheDocument();
    client.clear();
  });
  it("keeps center data lookup local when the user selects it", async () => {
    const fetch = mockFetch();
    const { client } = wrap();
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "AI Gemini" })).toBeEnabled(),
    );
    await user.click(
      screen.getByRole("button", { name: "Tra cứu tại trung tâm" }),
    );
    await user.type(
      screen.getByLabelText("Tin nhắn"),
      "Trung tâm có gói tập nào?",
    );
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    expect(await screen.findByText(/Các gói demo tại Sportiva/)).toBeVisible();
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
    client.clear();
  });
  it("creates an anonymous AI workout and saves it only after member review", async () => {
    const fetch = mockFetch();
    const { client } = wrap();
    const user = userEvent.setup();
    const before = readDemo().plans.length;
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "AI Gemini" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Gợi ý buổi tập" }));
    await user.selectOptions(
      screen.getByLabelText("Mục tiêu"),
      "Tăng sức mạnh",
    );
    await user.selectOptions(screen.getByLabelText("Thời gian dự kiến"), "30");
    await user.click(screen.getByRole("button", { name: "Tạo gợi ý" }));
    expect(await screen.findByText(reply.text)).toBeVisible();
    const post = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
    const payload = JSON.parse(post[1]!.body as string);
    expect(payload).toEqual({
      action: "workout",
      goal: "Tăng sức mạnh",
      level: "Mới bắt đầu",
      duration: 30,
      completedSessions: 1,
    });
    expect(readDemo().plans).toHaveLength(before);
    await user.click(
      screen.getByRole("button", { name: "Lưu vào kế hoạch của tôi" }),
    );
    const saved = readDemo().plans.at(-1)!;
    expect(saved.exercises).toBe(reply.text);
    expect(saved.notes).toContain("AI Gemini");
    client.clear();
  });
  it("disables switching and resetting while an AI request is in flight", async () => {
    let finish!: (response: Response) => void;
    const fetch = mockFetch(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { client } = wrap();
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "AI Gemini" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    await user.type(screen.getByLabelText("Tin nhắn"), "Khởi động");
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    expect(
      screen.getByRole("button", { name: "Cuộc trò chuyện mới" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Tra cứu tại trung tâm" }),
    ).toBeDisabled();
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
    finish(Response.json(reply));
    expect(await screen.findByText(reply.text)).toBeVisible();
    client.clear();
  });
});

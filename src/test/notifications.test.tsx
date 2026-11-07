/** CO07: HTTP is mocked; no requests reach a real Backend or database. */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../lib/auth";
import { demoSession } from "../lib/demo";
import type { Role, Session } from "../lib/types";
import { notificationsApi } from "../lib/notifications-api";
import ApiNotifications from "../components/ApiNotifications";
import { ToastProvider } from "../components/ui";
import { NotificationsPage } from "../pages/Management";

const clients: QueryClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
});
const clazz = { id: 8, className: "Lớp TEST", coachId: 3, status: "SCHEDULED" };
const student = {
  memberId: 10,
  fullName: "Học viên TEST",
  bookingStatus: "BOOKED",
};
const accepted = {
  acceptedRecipients: 1,
  onlineRecipientsAtSend: 0,
  workoutPlanIds: [],
};
function session(role: Role = "COACH", id = role === "COACH" ? 3 : 1): Session {
  return {
    mode: "api",
    token: "co07-test-only",
    user: {
      id,
      roleName: role,
      fullName: "TEST",
      email: "test@example.invalid",
      phone: "0900000000",
      status: "ACTIVE",
    },
  };
}
function ChangeAccount() {
  const { signIn } = useAuth();
  return (
    <button onClick={() => signIn(session("COACH", 4))}>
      Đổi tài khoản test
    </button>
  );
}
function page(role: Role = "COACH", demo = false) {
  sessionStorage.setItem(
    "sportiva-session",
    JSON.stringify(demo ? demoSession(role) : session(role)),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter>
          <ToastProvider>
            <ChangeAccount />
            {demo ? <NotificationsPage /> : <ApiNotifications />}
          </ToastProvider>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
function server(
  options: {
    post?: () => Promise<Response> | Response;
    roster?: () => Promise<Response> | Response;
    classes?: () => Promise<Response> | Response;
  } = {},
) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/v1/notifications?") && !init?.method)
      return Response.json({ content: [], page: 0, size: 20, hasNext: false });
    if (url === "/api/v1/notifications" && init?.method === "POST")
      return options.post
        ? options.post()
        : Response.json(accepted, { status: 202 });
    if (/\/classes\/8\/students$/.test(url))
      return options.roster ? options.roster() : Response.json([student]);
    if (url.includes("/classes"))
      return options.classes ? options.classes() : Response.json([clazz]);
    if (url === "/api/v1/users")
      return Response.json([
        {
          id: 10,
          fullName: student.fullName,
          roleName: "MEMBER",
          status: "ACTIVE",
        },
        { id: 3, fullName: "HLV TEST", roleName: "COACH", status: "ACTIVE" },
      ]);
    throw new Error(`Unexpected test request: ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const posts = (fetch: ReturnType<typeof server>) =>
  fetch.mock.calls.filter(([, init]) => init?.method === "POST");
async function preview(audience = "class", kind = "GENERAL", coachId?: string) {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Soạn thông báo / bài tập" }),
  );
  await user.selectOptions(screen.getByLabelText("Gửi đến"), audience);
  await user.selectOptions(screen.getByLabelText("Loại nội dung"), kind);
  await screen.findByRole("option", {
    name: audience === "class" ? clazz.className : student.fullName,
  });
  await user.selectOptions(
    screen.getByLabelText(
      audience === "class" ? "Lớp nhận thông báo" : "Học viên nhận thông báo",
    ),
    audience === "class" ? "8" : "10",
  );
  await user.type(screen.getByLabelText("Tiêu đề"), "  Bài tập tiếng Việt  ");
  await user.type(
    screen.getByLabelText("Nội dung / bài tập về nhà"),
    "  Khởi động và giãn cơ  ",
  );
  if (coachId) {
    await screen.findByRole("option", { name: "HLV TEST" });
    await user.selectOptions(
      screen.getByLabelText("Huấn luyện viên phụ trách bài tập"),
      coachId,
    );
  }
  await user.click(screen.getByRole("button", { name: "Xem trước nội dung" }));
  await screen.findByRole("button", { name: "Gửi thông báo" });
  return user;
}

describe("CO07 — gửi qua contract Backend", () => {
  it("keeps previews unsent and POSTs deduplicated BOOKED class members with JWT", async () => {
    const fetch = server({
      roster: () =>
        Response.json([
          student,
          student,
          { ...student, memberId: 11, bookingStatus: "CANCELLED" },
        ]),
    });
    page();
    const user = await preview();
    expect(posts(fetch)).toHaveLength(0);
    expect(
      screen.getByRole("dialog", { name: "Xem trước thông báo" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Gửi thông báo" }));
    expect(
      await screen.findByText(/Backend đã chấp nhận gửi tới 1 học viên/),
    ).toBeVisible();
    expect(posts(fetch)).toHaveLength(1);
    expect(JSON.parse(posts(fetch)[0][1]!.body as string)).toEqual({
      recipientIds: [10],
      title: "Bài tập tiếng Việt",
      content: "Khởi động và giãn cơ",
      kind: "GENERAL",
    });
    expect(posts(fetch)[0][1]!.headers).toMatchObject({
      Authorization: "Bearer co07-test-only",
    });
    expect(
      fetch.mock.calls.some(([url]) =>
        /notifications\/(stream|unread|read)/.test(String(url)),
      ),
    ).toBe(false);
    expect(screen.getByText(/Thông báo GENERAL được lưu/)).toBeVisible();
  });
  it("sends HOMEWORK to one assigned member and invalidates workout plans", async () => {
    const fetch = server({
      post: () =>
        Response.json({ ...accepted, workoutPlanIds: [77] }, { status: 202 }),
    });
    const { client } = page();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const user = await preview("member", "HOMEWORK");
    await user.click(screen.getByRole("button", { name: "Gửi thông báo" }));
    expect(
      await screen.findByText(/đã tạo 1 kế hoạch tập luyện/),
    ).toBeVisible();
    expect(JSON.parse(posts(fetch)[0][1]!.body as string)).toMatchObject({
      recipientIds: [10],
      kind: "HOMEWORK",
    });
    expect(JSON.parse(posts(fetch)[0][1]!.body as string)).not.toHaveProperty(
      "coachId",
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["workout-plans"] });
  });
  it("supplies the class coach for manager HOMEWORK", async () => {
    const fetch = server({
      post: () =>
        Response.json({ ...accepted, workoutPlanIds: [77] }, { status: 202 }),
    });
    page("CENTER_MANAGER");
    const user = await preview("class", "HOMEWORK");
    await user.click(screen.getByRole("button", { name: "Gửi thông báo" }));
    await screen.findByText(/Backend đã chấp nhận/);
    expect(JSON.parse(posts(fetch)[0][1]!.body as string)).toMatchObject({
      coachId: 3,
      kind: "HOMEWORK",
    });
  });
  it("requires and sends the selected coach for manager homework to one member", async () => {
    const fetch = server({
      post: () =>
        Response.json({ ...accepted, workoutPlanIds: [77] }, { status: 202 }),
    });
    page("CENTER_MANAGER");
    const user = await preview("member", "HOMEWORK", "3");
    await user.click(screen.getByRole("button", { name: "Gửi thông báo" }));
    await screen.findByText(/Backend đã chấp nhận/);
    expect(JSON.parse(posts(fetch)[0][1]!.body as string)).toMatchObject({
      recipientIds: [10],
      coachId: 3,
    });
  });
  it("blocks double submit while awaiting the Backend and never reports early success", async () => {
    let finish!: (response: Response) => void;
    const fetch = server({
      post: () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    });
    page();
    const user = await preview();
    const button = screen.getByRole("button", { name: "Gửi thông báo" });
    await user.dblClick(button);
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    expect(button).toBeDisabled();
    expect(screen.queryByText(/Backend đã chấp nhận/)).not.toBeInTheDocument();
    await act(async () => finish(Response.json(accepted, { status: 202 })));
    await screen.findByText(/Backend đã chấp nhận/);
  });
  it.each([400, 403, 500])(
    "shows HTTP %s without success and permits an explicit retry",
    async (status) => {
      let fail = true;
      const fetch = server({
        post: () =>
          fail
            ? Response.json({ message: "Không gửi được TEST" }, { status })
            : Response.json(accepted, { status: 202 }),
      });
      page();
      const user = await preview();
      await user.click(screen.getByRole("button", { name: "Gửi thông báo" }));
      expect(await screen.findByText("Không gửi được TEST")).toBeVisible();
      expect(
        screen.queryByText(/Backend đã chấp nhận/),
      ).not.toBeInTheDocument();
      fail = false;
      await user.click(screen.getByRole("button", { name: "Gửi thông báo" }));
      await screen.findByText(/Backend đã chấp nhận/);
      expect(posts(fetch)).toHaveLength(2);
    },
  );
  it("shows network errors and does not auto retry POST", async () => {
    const fetch = server({
      post: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    page();
    const user = await preview();
    await user.click(screen.getByRole("button", { name: "Gửi thông báo" }));
    await screen.findByText(
      "Không kết nối được backend. Kiểm tra máy chủ và cấu hình API.",
    );
    expect(posts(fetch)).toHaveLength(1);
    expect(screen.queryByText(/Backend đã chấp nhận/)).not.toBeInTheDocument();
  });
  it("ends the API session on 401 without showing success", async () => {
    server({ post: () => Response.json({}, { status: 401 }) });
    page();
    const user = await preview();
    await user.click(screen.getByRole("button", { name: "Gửi thông báo" }));
    await waitFor(() =>
      expect(sessionStorage.getItem("sportiva-session")).toBeNull(),
    );
    expect(screen.queryByText(/Backend đã chấp nhận/)).not.toBeInTheDocument();
  });
  it("does not POST when the fresh class roster is empty or cancelled", async () => {
    let cancelled = false;
    const fetch = server({
      roster: () =>
        Response.json([
          { ...student, bookingStatus: cancelled ? "CANCELLED" : "BOOKED" },
        ]),
    });
    page();
    const user = await preview();
    cancelled = true;
    await user.click(screen.getByRole("button", { name: "Gửi thông báo" }));
    expect(
      await screen.findByText(/Danh sách học viên đã thay đổi/),
    ).toBeVisible();
    expect(posts(fetch)).toHaveLength(0);
  });
  it("does not POST to more than 100 class recipients", async () => {
    const fetch = server({
      roster: () =>
        Response.json(
          Array.from({ length: 101 }, (_, i) => ({
            ...student,
            memberId: i + 1,
          })),
        ),
    });
    page();
    await userEvent.click(
      screen.getByRole("button", { name: "Soạn thông báo / bài tập" }),
    );
    await screen.findByRole("option", { name: clazz.className });
    await userEvent.selectOptions(
      screen.getByLabelText("Lớp nhận thông báo"),
      "8",
    );
    expect(await screen.findByText(/Một lần gửi tối đa 100/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Xem trước nội dung" }),
    ).toBeDisabled();
    expect(posts(fetch)).toHaveLength(0);
  });
  it("shows roster errors without posting, then retries fresh roster on send", async () => {
    let fail = false;
    const fetch = server({
      roster: () =>
        fail
          ? Response.json({ message: "Không đọc được lớp" }, { status: 403 })
          : Response.json([student]),
    });
    page();
    const user = await preview();
    fail = true;
    await user.click(screen.getByRole("button", { name: "Gửi thông báo" }));
    expect(await screen.findByText("Không đọc được lớp")).toBeVisible();
    expect(posts(fetch)).toHaveLength(0);
    fail = false;
    await user.click(screen.getByRole("button", { name: "Gửi thông báo" }));
    await screen.findByText(/Backend đã chấp nhận/);
  });
  it("shows recipient loading and allows retry when class loading fails", async () => {
    let finish!: (response: Response) => void;
    let fail = true;
    server({
      classes: () =>
        fail
          ? new Promise<Response>((resolve) => {
              finish = resolve;
            })
          : Response.json([clazz]),
    });
    page();
    await userEvent.click(
      screen.getByRole("button", { name: "Soạn thông báo / bài tập" }),
    );
    expect(
      screen.getByRole("button", { name: "Xem trước nội dung" }),
    ).toBeDisabled();
    await act(async () =>
      finish(Response.json({ message: "Lỗi lớp TEST" }, { status: 500 })),
    );
    await screen.findByText("Lỗi lớp TEST");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: /Thử lại/ }));
    await screen.findByRole("option", { name: clazz.className });
  });
  it("filters other coaches' classes and validates blank drafts without sending", async () => {
    const fetch = server({
      classes: () =>
        Response.json([
          clazz,
          { ...clazz, id: 9, coachId: 4, className: "Lớp ngoài phạm vi" },
        ]),
    });
    page();
    await userEvent.click(
      screen.getByRole("button", { name: "Soạn thông báo / bài tập" }),
    );
    await screen.findByRole("option", { name: clazz.className });
    expect(
      screen.queryByRole("option", { name: "Lớp ngoài phạm vi" }),
    ).not.toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByLabelText("Lớp nhận thông báo"),
      "8",
    );
    fireEvent.change(screen.getByLabelText("Tiêu đề"), {
      target: { value: "  " },
    });
    fireEvent.change(screen.getByLabelText("Nội dung / bài tập về nhà"), {
      target: { value: "  " },
    });
    fireEvent.submit(screen.getByLabelText("Tiêu đề").closest("form")!);
    expect(
      await screen.findByText(/Tiêu đề và nội dung bắt buộc/),
    ).toBeVisible();
    expect(posts(fetch)).toHaveLength(0);
  });
  it("drops the old draft and late send result when accounts change", async () => {
    let finish!: (response: Response) => void;
    const fetch = server({
      post: () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    });
    page();
    const user = await preview();
    await user.click(screen.getByRole("button", { name: "Gửi thông báo" }));
    await waitFor(() => expect(posts(fetch)).toHaveLength(1));
    // Programmatic account switch while a modal is open, as signOut/signIn may be external.
    fireEvent.click(screen.getByRole("button", { name: "Đổi tài khoản test" }));
    await act(async () => finish(Response.json(accepted, { status: 202 })));
    expect(screen.queryByText(/Backend đã chấp nhận/)).not.toBeInTheDocument();
    expect(screen.queryByText("Trạng thái: Chưa gửi")).not.toBeInTheDocument();
  });
  it("does not send using a new account when the old roster response arrives late", async () => {
    let finish!: (response: Response) => void;
    let hold = false;
    const fetch = server({
      roster: () =>
        hold
          ? new Promise<Response>((resolve) => {
              finish = resolve;
            })
          : Response.json([student]),
    });
    page();
    const user = await preview();
    hold = true;
    await user.click(screen.getByRole("button", { name: "Gửi thông báo" }));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    fireEvent.click(screen.getByRole("button", { name: "Đổi tài khoản test" }));
    await act(async () => finish(Response.json([student])));
    expect(posts(fetch)).toHaveLength(0);
    expect(screen.queryByText(/Backend đã chấp nhận/)).not.toBeInTheDocument();
  });
  it.each<Role>(["MEMBER", "RECEPTIONIST"])(
    "denies composing and sending for %s",
    async (role) => {
      const fetch = server();
      page(role);
      expect(
        screen.queryByRole("button", { name: "Soạn thông báo / bài tập" }),
      ).not.toBeInTheDocument();
      await expect(
        notificationsApi.send({
          recipientIds: [10],
          title: "T",
          content: "C",
          kind: "GENERAL",
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(posts(fetch)).toHaveLength(0);
    },
  );
  it("retains the demo notification screen without an API POST", () => {
    const fetch = server();
    page("COACH", true);
    expect(
      screen.getByRole("button", { name: "Gửi thông báo / bài tập" }),
    ).toBeVisible();
    expect(posts(fetch)).toHaveLength(0);
  });
});

describe("CO07 client validation", () => {
  it.each([
    { title: " ", content: "Nội dung", recipientIds: [10] },
    { title: "T".repeat(151), content: "C", recipientIds: [10] },
    { title: "T", content: "C".repeat(4001), recipientIds: [10] },
    { title: "T", content: "C", recipientIds: [0] },
    { title: "T", content: "C", recipientIds: [1.5] },
    { title: "T", content: "C", recipientIds: [] },
  ])("rejects invalid input before HTTP %#", async (input) => {
    sessionStorage.setItem("sportiva-session", JSON.stringify(session()));
    const fetch = server();
    await expect(
      notificationsApi.send({ ...input, kind: "GENERAL" }),
    ).rejects.toBeInstanceOf(Error);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("accepts the documented 150/4000 boundaries and does not require arbitrary minimum lengths", async () => {
    sessionStorage.setItem("sportiva-session", JSON.stringify(session()));
    const fetch = server();
    await notificationsApi.send({
      recipientIds: [10],
      title: "T".repeat(150),
      content: "C".repeat(4000),
      kind: "GENERAL",
    });
    await notificationsApi.send({
      recipientIds: [10],
      title: "T",
      content: "C",
      kind: "GENERAL",
    });
    expect(posts(fetch)).toHaveLength(2);
  });
  it("rejects malformed success responses instead of claiming success", async () => {
    server({
      post: () => Response.json({ id: 1, title: "Wrong DTO" }, { status: 202 }),
    });
    page();
    const user = await preview();
    await user.click(screen.getByRole("button", { name: "Gửi thông báo" }));
    expect(
      await screen.findByText(/Kết quả gửi thông báo từ máy chủ không hợp lệ/),
    ).toBeVisible();
    expect(screen.queryByText(/Backend đã chấp nhận/)).not.toBeInTheDocument();
  });
});

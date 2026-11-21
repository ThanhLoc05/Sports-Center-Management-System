import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App";
import { ToastProvider } from "../components/ui";
import { api } from "../lib/api";
import { AuthProvider } from "../lib/auth";
import { demoSession, readDemo } from "../lib/demo";
import { notificationsApi, type NotificationEvent } from "../lib/notifications-api";
import { localDate } from "../lib/utils";
import type { SportClass } from "../lib/types";

vi.mock("../lib/demo", () => import("./fixtures/published-demo-fixture"));
afterEach(() => vi.unstubAllEnvs());

async function openMemberCalendar(firstRead?: Promise<SportClass[]>) {
  vi.stubEnv("VITE_DATA_MODE", "api");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
  const session = { ...demoSession("MEMBER"), mode: "api", token: "test-session" };
  sessionStorage.setItem("sportiva-session", JSON.stringify(session));
  const date = localDate();
  let item = { ...readDemo().classes[0], scheduleTime: date + "T10:00:00" };
  const booking = { id: 91, memberId: session.user.id, classId: item.id, status: "BOOKED", bookedAt: date };
  const classes = vi.spyOn(api, "classes").mockImplementation(async () => [item]);
  if (firstRead) classes.mockImplementationOnce(() => firstRead);
  const detail = vi.spyOn(api, "classDetail").mockImplementation(async () => item);
  const bookings = vi.spyOn(api, "bookings").mockImplementation(async () => [
    { ...booking, status: item.status === "CANCELLED" ? "CANCELLED" : "BOOKED" },
  ]);
  vi.spyOn(api, "coaches").mockResolvedValue([]);
  let deliver!: (event: NotificationEvent) => void;
  let disconnect!: () => void;
  const connect = vi.spyOn(notificationsApi, "connect").mockImplementation((callback, signal, onOpen) => {
    deliver = callback;
    onOpen?.();
    return new Promise<void>((resolve) => {
      disconnect = resolve;
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  render(<QueryClientProvider client={client}><AuthProvider><ToastProvider>
    <MemoryRouter initialEntries={["/schedule"]}><App /></MemoryRouter>
  </ToastProvider></AuthProvider></QueryClientProvider>);
  await userEvent.setup().click(await screen.findByRole("button", { name: "Danh sách" }));
  await screen.findByText("10:00", { selector: ".schedule-list-item strong" });
  const event: NotificationEvent = {
    id: 123, kind: "GENERAL", recipientId: session.user.id, senderId: 1,
    title: "Lớp học thay đổi lịch", content: "Đã cập nhật lịch học",
    link: "/schedule", createdAt: date + "T09:00:00",
  };
  return {
    classes, bookings, detail, connect, event, session, client, name: item.className,
    move: () => { item = { ...item, scheduleTime: date + "T16:00:00" }; },
    cancel: () => { item = { ...item, status: "CANCELLED" }; },
    emit: (overrides: Partial<NotificationEvent> = {}) => act(() => deliver({ ...event, ...overrides })),
    disconnect: () => act(() => disconnect()),
  };
}

it("updates the open list after a schedule change and ignores wrong recipients, unrelated links and replays", async () => {
  const view = await openMemberCalendar();
  const before = view.classes.mock.calls.length;
  const ownReads = view.bookings.mock.calls.length;
  view.move();
  view.emit({ recipientId: view.session.user.id + 1 });
  view.emit({ id: 122, link: "/memberships" });
  expect(view.classes).toHaveBeenCalledTimes(before);
  expect(view.bookings).toHaveBeenCalledTimes(ownReads);
  view.emit();
  await screen.findByText("16:00", { selector: ".schedule-list-item strong" });
  view.emit();
  expect(view.classes).toHaveBeenCalledTimes(before + 1);
  expect(view.bookings).toHaveBeenCalledTimes(ownReads + 1);
  expect(view.connect).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Phạm vi lịch học")).toHaveValue("mine");
  expect(JSON.parse(sessionStorage.getItem("sportiva-session")!)).toEqual(view.session);
});

it("removes a cancelled class and refreshes personal bookings on the same page", async () => {
  const view = await openMemberCalendar();
  view.cancel();
  view.emit({ title: "Lớp học đã hủy" });
  await waitFor(() => expect(screen.queryByRole("button", { name: view.name })).toBeNull());
  expect(view.client.getQueryData(["bookings", view.session.user.id])).toMatchObject([{ status: "CANCELLED" }]);
  expect(view.connect).toHaveBeenCalledTimes(1);
});

it("discards a pending initial read when the stream opens", async () => {
  let finish!: (rows: SportClass[]) => void;
  const firstRead = new Promise<SportClass[]>((resolve) => { finish = resolve; });
  const view = await openMemberCalendar(firstRead);
  await act(async () => finish([]));
  expect(screen.getByRole("button", { name: view.name })).toBeVisible();
  expect(view.classes).toHaveBeenCalledTimes(2);
});

it("catches up when the stream reconnects without replaying the missed event", async () => {
  const view = await openMemberCalendar();
  view.disconnect();
  view.move();
  await waitFor(() => expect(view.connect).toHaveBeenCalledTimes(2), { timeout: 4000 });
  expect(await screen.findByText("16:00", { selector: ".schedule-list-item strong" })).toBeVisible();
});

it("refreshes the open detail modal when the class is moved and then cancelled", async () => {
  const view = await openMemberCalendar();
  await userEvent.setup().click(screen.getByRole("button", { name: view.name }));
  const modal = () => within(screen.getByRole("dialog"));
  await waitFor(() => expect(modal().getByText(/10:00/)).toBeVisible());
  view.move();
  view.emit();
  await waitFor(() => expect(modal().getByText(/16:00/)).toBeVisible());
  expect(modal().queryByText(/10:00/)).toBeNull();
  view.cancel();
  view.emit({ id: 124, title: "Lớp học đã hủy" });
  await waitFor(() => expect(modal().getByText("Đã hủy")).toBeVisible());
  expect(modal().queryByRole("button", { name: "Đăng ký lớp học" })).toBeNull();
  expect(view.detail).toHaveBeenCalledTimes(3);
});

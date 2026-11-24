import { request } from "./api";
import type { BankConfig } from "./payment-qr";
import type { Invoice, SportClass } from "./types";

export type ProgramKind = "REGULAR" | "COURSE";
export interface TrainingSlot {
  id?: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  coachId: number;
  roomId: number;
  coachName?: string;
  roomName?: string;
}
export interface ProgramInput {
  name: string;
  sportId: number;
  description: string;
  trainingLevel: string;
  maxCapacity: number;
  requiredAccessLevel: string;
  slots: TrainingSlot[];
  totalSessions?: number;
  startDate?: string;
  price?: number;
  discountEligible?: boolean;
}
export interface TrainingProgram extends ProgramInput {
  id: number;
  kind: ProgramKind;
  sportName: string;
  status: string;
  endDate?: string;
  discountPercent: number;
  payableAmount?: number;
  remainingCapacity: number;
  eligible: boolean;
  eligibilityReason: string;
  registered: boolean;
  registrationUntil?: string;
}
export interface Availability {
  dayOfWeek?: number;
  date?: string;
  fromTime?: string;
  toTime?: string;
}
export interface TrainingSearch {
  sportId?: number;
  coachId?: number;
  memberId?: number;
  availability?: Availability[];
}
export interface TrainingAccess {
  hasActiveMembership: boolean;
  subscriptionId?: number;
  accessLevel?: string;
  endDate?: string;
  sportLimit?: number | null;
  maxConcurrentClasses?: number;
  courseDiscountPercent?: number;
  selectedSportIds?: number[];
  activeClassCount?: number;
}
export interface ClassRegistration {
  id: number;
  regularClassId: number;
  className: string;
  memberId: number;
  subscriptionId: number;
  validFrom: string;
  validUntil: string;
  status: string;
}
export interface CourseOrder {
  id: number;
  courseId: number;
  courseName: string;
  memberId: number;
  memberName: string;
  subscriptionId: number;
  status: string;
  paymentMethod: string;
  listPrice: number;
  discountPercent: number;
  amount: number;
  createdAt: string;
  expiresAt: string;
  confirmedAt?: string;
  version: number;
  invoice: Invoice;
  paymentReference: string;
  bankAccount?: BankConfig;
}
const path = (kind: ProgramKind) =>
  kind === "REGULAR" ? "/regular-classes" : "/courses";
const body = (method: string, value?: unknown): RequestInit => ({
  method,
  ...(value === undefined ? {} : { body: JSON.stringify(value) }),
});
export const trainingApi = {
  access: (memberId?: number) =>
    request<TrainingAccess>(
      "/training-access" + (memberId ? `?memberId=${memberId}` : ""),
    ),
  search: (kind: ProgramKind, search: TrainingSearch) =>
    request<TrainingProgram[]>(path(kind) + "/search", body("POST", search)),
  detail: (kind: ProgramKind, id: number, memberId?: number) =>
    request<TrainingProgram>(
      path(kind) + `/${id}` + (memberId ? `?memberId=${memberId}` : ""),
    ),
  sessions: (kind: ProgramKind, id: number) =>
    request<SportClass[]>(path(kind) + `/${id}/sessions`),
  save: (kind: ProgramKind, input: ProgramInput, id?: number) =>
    request<TrainingProgram>(
      path(kind) + (id ? `/${id}` : ""),
      body(id ? "PUT" : "POST", input),
    ),
  preview: (input: ProgramInput) =>
    request<{ start: string; end: string }[]>(
      "/courses/preview",
      body("POST", input),
    ),
  status: (id: number, status: string) =>
    request<TrainingProgram>(
      `/regular-classes/${id}/status?status=${status}`,
      body("PATCH"),
    ),
  cancelCourse: (id: number) =>
    request<TrainingProgram>(`/courses/${id}/cancel`, body("POST")),
  register: (id: number, memberId?: number) =>
    request<ClassRegistration>(
      `/regular-classes/${id}/register` +
        (memberId ? `?memberId=${memberId}` : ""),
      body("POST"),
    ),
  registrations: (memberId?: number) =>
    request<ClassRegistration[]>(
      "/class-registrations" + (memberId ? `?memberId=${memberId}` : ""),
    ),
  cancelRegistration: (id: number) =>
    request<void>(`/class-registrations/${id}`, body("DELETE")),
  orders: (memberId?: number) =>
    request<CourseOrder[]>(
      "/course-orders" + (memberId ? `?memberId=${memberId}` : ""),
    ),
  order: (id: number) => request<CourseOrder>(`/course-orders/${id}`),
  createOrder: (
    courseId: number,
    paymentMethod: string,
    memberId: number | undefined,
    key: string,
  ) =>
    request<CourseOrder>("/course-orders", {
      ...body("POST", { courseId, memberId, paymentMethod }),
      headers: { "Idempotency-Key": key },
    }),
  confirm: (id: number, version: number) =>
    request<CourseOrder>(
      `/course-orders/${id}/confirm-payment`,
      body("POST", { version }),
    ),
  cancelOrder: (id: number) =>
    request<CourseOrder>(`/course-orders/${id}/cancel`, body("POST")),
};
export const weekday = (day: number) =>
  day === 7 ? "Chủ nhật" : `Thứ ${day + 1}`;
export function fitsAvailability(
  slots: TrainingSlot[],
  windows: Availability[],
) {
  return (
    !windows.length ||
    slots.every((slot) =>
      windows.some((window) => {
        const day = window.date
          ? ((new Date(window.date + "T12:00:00").getDay() + 6) % 7) + 1
          : window.dayOfWeek;
        return (
          slot.dayOfWeek === day &&
          (!window.fromTime ||
            slot.startTime.slice(0, 5) >= window.fromTime.slice(0, 5)) &&
          (!window.toTime ||
            slot.endTime.slice(0, 5) <= window.toTime.slice(0, 5))
        );
      }),
    )
  );
}

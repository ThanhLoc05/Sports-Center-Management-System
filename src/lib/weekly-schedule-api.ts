import { request } from "./api";
import type { AccessLevel } from "./types";

export type Weekday =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export interface WeeklyClass {
  className: string;
  sportId: number;
  coachId: number;
  roomId: number;
  maxCapacity: number;
  requiredAccessLevel: AccessLevel;
  weekdays: Weekday[];
  slotCode: string;
}

export interface WeeklyScheduleInput {
  startDate: string;
  weeks: number;
  entries: WeeklyClass[];
  excludedKeys?: string[];
}

export interface PreviewOccurrence extends Omit<
  WeeklyClass,
  "weekdays" | "requiredAccessLevel"
> {
  key: string;
  status: "READY" | "EXISTS" | "CONFLICT" | "EXCLUDED";
  date: string;
  message?: string;
  classId?: number;
}

export interface WeeklySchedulePreview {
  startDate: string;
  endDate: string;
  occurrences: PreviewOccurrence[];
  token: string;
}

export type SavedWeeklyWindow = Omit<WeeklyScheduleInput, "entries"> & { version: number };

export interface SavedWeeklySchedule {
  version: number;
  name: string;
  entries: WeeklyClass[];
}

interface WeeklyScheduleResult {
  created: number;
  alreadyExisted: number;
  excluded: number;
  startDate: string;
  endDate: string;
}

interface PublishedSession {
  seriesKey: string;
  plannedDate: string;
  classId: number;
}

export type SyncMode = "TEMPLATE_ONLY" | "SELECTED_WEEK" | "FUTURE_PUBLISHED";

export interface SyncChange {
  action: "CREATE" | "UPDATE" | "SKIP" | "CONFLICT";
  date: string;
  slotCode: string;
  className: string;
  classId: number | null;
  message: string | null;
}

export interface SyncPreview {
  mode: SyncMode;
  changes: SyncChange[];
  token: string;
}

export interface SyncOptions {
  mode: SyncMode;
  weekStart?: string;
  token?: string;
  sourceIndices?: (number | null)[];
}

const recurring = "/classes/recurring";

export const weeklyScheduleApi = {
  published: () => request<PublishedSession[]>(recurring),
  template: () => request<SavedWeeklySchedule>(recurring + "/template"),
  save: (version: number, entries: WeeklyClass[], sync?: SyncOptions) =>
    request<SavedWeeklySchedule>(recurring + "/template", {
      method: "PUT",
      body: JSON.stringify({ version, entries, ...sync }),
    }),
  syncPreview: (version: number, entries: WeeklyClass[], sync: SyncOptions) =>
    request<SyncPreview>(recurring + "/template/sync-preview", {
      method: "POST",
      body: JSON.stringify({ version, entries, ...sync }),
    }),
  preview: (input: SavedWeeklyWindow) =>
    request<WeeklySchedulePreview>(recurring + "/template/preview", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  confirm: (input: SavedWeeklyWindow, token: string) =>
    request<WeeklyScheduleResult>(recurring + "/template/confirm", {
      method: "POST",
      body: JSON.stringify({ ...input, token }),
    }),
};

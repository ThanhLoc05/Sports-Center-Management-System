import { describe, expect, it } from "vitest";
import {
  addDays,
  dateLabel,
  dateTimeLocal,
  isAttendanceWindowOpen,
  localDate,
  parseDate,
  timeLabel,
} from "../lib/utils";
import type { SportClass } from "../lib/types";
describe("Vietnam center timezone independent of device locale", () => {
  it("interprets naive BE LocalDateTime as UTC+7", () => {
    expect(parseDate("2026-10-15T08:30:00").toISOString()).toBe(
      "2026-10-15T01:30:00.000Z",
    );
  });
  it("preserves LocalDate at midnight in Vietnam", () => {
    expect(dateLabel("2026-10-15")).toBe("15/10/2026");
  });
  it("displays an offset/UTC timestamp in center time", () => {
    expect(timeLabel("2026-10-15T01:30:00Z")).toBe("08:30");
    expect(timeLabel("2026-10-15T08:30:00")).toBe("08:30");
  });
  it("rolls over the center date at 17:00 UTC", () => {
    expect(localDate(new Date("2026-10-14T18:00:00Z"))).toBe("2026-10-15");
  });
  it("serializes datetime-local without a UTC suffix", () => {
    expect(dateTimeLocal(new Date("2026-10-15T01:30:00Z"))).toBe(
      "2026-10-15T08:30:00",
    );
  });
  it("adds calendar days correctly over month boundaries", () => {
    expect(localDate(addDays(1, parseDate("2026-10-31")))).toBe("2026-11-01");
  });
  it("opens attendance 15 minutes before class and closes 60 minutes after it ends", () => {
    const sportClass: SportClass = {
      id: 1,
      className: "Yoga",
      sportId: 1,
      coachId: 2,
      roomId: 1,
      maxCapacity: 10,
      scheduleTime: "2026-11-12T10:00:00",
      durationMinutes: 60,
      requiredAccessLevel: "STANDARD",
      status: "SCHEDULED",
    };

    expect(
      isAttendanceWindowOpen(
        sportClass,
        new Date("2026-11-12T09:45:00+07:00"),
      ),
    ).toBe(true);
    expect(
      isAttendanceWindowOpen(
        sportClass,
        new Date("2026-11-12T12:00:00+07:00"),
      ),
    ).toBe(true);
    expect(
      isAttendanceWindowOpen(
        sportClass,
        new Date("2026-11-12T09:44:59+07:00"),
      ),
    ).toBe(false);
    expect(
      isAttendanceWindowOpen(
        sportClass,
        new Date("2026-11-12T12:00:01+07:00"),
      ),
    ).toBe(false);
  });
});

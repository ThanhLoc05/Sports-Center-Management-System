import { describe, it, expect } from "vitest";
import { fitsAvailability } from "./training-api";
import { courseEndDate } from "../components/TrainingProgramForm";
const slots = [1, 3, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: "17:50:00",
  endTime: "18:50:00",
  coachId: 1,
  roomId: 1,
}));
describe("fixed weekly registration", () => {
  it("requires all weekly slots to fit, including the full duration", () => {
    expect(fitsAvailability(slots, [])).toBe(true);
    expect(fitsAvailability(slots, [{ dayOfWeek: 1 }])).toBe(false);
    expect(
      fitsAvailability(
        slots,
        [1, 3, 5].map((dayOfWeek) => ({
          dayOfWeek,
          fromTime: "17:50",
          toTime: "18:50",
        })),
      ),
    ).toBe(true);
    expect(
      fitsAvailability(
        slots,
        [1, 3, 5].map((dayOfWeek) => ({
          dayOfWeek,
          fromTime: "18:00",
          toTime: "19:00",
        })),
      ),
    ).toBe(false);
  });
  it("calculates course end from sessions and weekly days", () => {
    expect(courseEndDate("2026-11-30", 12, [1, 3, 5])).toBe("2026-12-25");
    expect(courseEndDate("2026-12-01", 4, [2, 4])).toBe("2026-12-10");
    expect(courseEndDate("2026-12-01", 12, [1, 3, 5])).toBe("");
  });
});

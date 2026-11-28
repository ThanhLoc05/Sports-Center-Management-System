/** Bộ lọc 3 bộ môn hiển thị: chỉ ẩn trên màn hình, so tên không phân biệt hoa/thường và cách gõ dấu. */
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("isVisibleSport", () => {
  it("keeps only Cầu lông, Yoga and Dance when the default list applies", async () => {
    vi.stubEnv("VITE_VISIBLE_SPORTS", "");
    vi.resetModules();
    const { isVisibleSport } = await import("../lib/api");
    expect(isVisibleSport("Yoga")).toBe(true);
    expect(isVisibleSport(" dance ")).toBe(true);
    // "Cầu lông" gõ dạng dấu tổ hợp (NFD) vẫn phải khớp.
    expect(isVisibleSport("Cầu lông".normalize("NFD"))).toBe(true);
    expect(isVisibleSport("Fitness")).toBe(false);
    expect(isVisibleSport("Bơi lội")).toBe(false);
  });

  it("shows every sport when the list is '*'", async () => {
    vi.stubEnv("VITE_VISIBLE_SPORTS", "*");
    vi.resetModules();
    const { isVisibleSport } = await import("../lib/api");
    expect(isVisibleSport("Boxing")).toBe(true);
  });
});

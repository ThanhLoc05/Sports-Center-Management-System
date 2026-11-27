import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
beforeEach(async () => {
  vi.stubGlobal("scrollTo", vi.fn());
  const { api } = await import("../lib/api");
  if (typeof api.features === "function") {
    vi.spyOn(api, "features").mockResolvedValue({ courseEnabled: true });
  }
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

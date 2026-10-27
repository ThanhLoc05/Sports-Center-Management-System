import { describe, expect, it } from "vitest";
import { csvContent } from "../lib/utils";
describe("Safe Vietnamese CSV export", () => {
  it("adds UTF-8 BOM and quotes commas/newlines", () => {
    expect(
      csvContent([
        ["Tên", "Nội dung"],
        ["Nguyễn Anh", "một, hai\ndòng mới"],
      ]),
    ).toBe('\uFEFF"Tên","Nội dung"\r\n"Nguyễn Anh","một, hai\ndòng mới"');
  });
  it("escapes quotes and null values", () => {
    expect(csvContent([['A "quote"', null]])).toBe('\uFEFF"A ""quote""",""');
  });
  it.each([
    '=HYPERLINK("https://example.test")',
    "+cmd",
    "-10+10",
    "@SUM(A1)",
    "  =1+1",
    "\tformula",
    "\rformula",
  ])("neutralizes formula prefix in %s", (value) => {
    expect(csvContent([[value]])).toMatch(/^\uFEFF"'/);
  });
});

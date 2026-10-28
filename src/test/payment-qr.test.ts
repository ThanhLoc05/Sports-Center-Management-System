import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import jsQR from "jsqr";
import {
  buildVietQr,
  buildPreviewQr,
  crc16,
  getBankConfig,
  saveBankConfig,
} from "../lib/payment-qr";
import { demoSession } from "../lib/demo";
const bank = {
  bankBin: "970436",
  bankName: "Ngân hàng test",
  accountNo: "0000000000",
  accountName: "TAI KHOAN THU NGHIEM",
};
describe("QR chuyển khoản", () => {
  it("has no default recipient and refuses unauthorized configuration", () => {
    expect(getBankConfig()).toBeNull();
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify(demoSession("MEMBER")),
    );
    expect(() => saveBankConfig(bank)).toThrow("quản lý");
  });
  it("stores a manager-configured account locally without any network call", () => {
    sessionStorage.setItem(
      "sportiva-session",
      JSON.stringify(demoSession("CENTER_MANAGER")),
    );
    saveBankConfig(bank);
    expect(getBankConfig()).toEqual(bank);
  });
  it("uses the standard CRC reference and binds bank, account, amount and invoice", () => {
    expect(crc16("123456789")).toBe("29B1");
    const payload = buildVietQr(bank, 800000, 1001);
    expect(payload).toContain("A000000727");
    expect(payload).toContain(bank.accountNo);
    expect(payload).toContain("QRIBFTTA");
    expect(payload).toContain("5406800000");
    expect(payload).toContain("SPORTIVA HD1001");
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER])(
    "rejects invalid amount %s",
    (amount) => {
      expect(() => buildVietQr(bank, amount, 1)).toThrow();
    },
  );
  it("keeps preview QR clearly non-payable with no bank details", () => {
    const payload = buildPreviewQr(1000, 3);
    expect(payload).toBe("SPORTIVA PREVIEW | HD3 | 1000 VND | NOT FOR PAYMENT");
    expect(payload).not.toContain("A000000727");
    expect(payload).not.toContain("QRIBFTTA");
    expect(getBankConfig()).toBeNull();
    expect(() => buildPreviewQr(0, 3)).toThrow();
    expect(() => buildPreviewQr(1000, -1)).toThrow();
  });
  it.each([
    ["VietQR", buildVietQr(bank, 800000, 1001)],
    ["preview", buildPreviewQr(1000, 3)],
  ])(
    "renders independently decodable %s with the exact payload",
    (_name, payload) => {
      const symbol = QRCode.create(payload, { errorCorrectionLevel: "M" }),
        scale = 6,
        border = 4,
        width = (symbol.modules.size + border * 2) * scale,
        pixels = new Uint8ClampedArray(width * width * 4);
      for (let y = 0; y < width; y++)
        for (let x = 0; x < width; x++) {
          const row = Math.floor(y / scale) - border,
            col = Math.floor(x / scale) - border;
          const dark =
            row >= 0 &&
            col >= 0 &&
            row < symbol.modules.size &&
            col < symbol.modules.size &&
            symbol.modules.data[row * symbol.modules.size + col];
          const i = (y * width + x) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = dark ? 0 : 255;
          pixels[i + 3] = 255;
        }
      expect(jsQR(pixels, width, width)?.data).toBe(payload);
    },
  );
});

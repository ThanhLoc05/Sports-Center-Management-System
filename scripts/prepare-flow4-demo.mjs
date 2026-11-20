/** Tạo lại ba lớp demo 21/11 trên database mẫu của máy đang chạy Sportiva. */
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

const apiBase = "http://127.0.0.1:8080/api/v1";
const webBase = "http://127.0.0.1:5173";
const demoDate = "2026-11-21";
const duration = 30;
const managerEmail = "manager.demo@sportiva.test";
const coachEmails = [1, 2, 3].map((n) => `coach${n}.demo@sportiva.test`);
const memberEmail = (n) =>
  `member${String(n).padStart(2, "0")}.demo@sportiva.test`;
const sampleMembers = /^member\d{2}\.demo@sportiva\.test$/;
const slots = [
  {
    name: "Cầu lông cơ bản - Kỹ thuật giao cầu",
    legacyTitle: "Cầu lông giao cầu",
    sport: "Cầu lông",
    room: "Sân đa năng 1",
    hour: "09:05",
    members: [1, 2, 4, 6, 11],
  },
  {
    name: "Bóng rổ - Kỹ thuật ném rổ",
    legacyTitle: "Bóng rổ ném rổ",
    sport: "Bóng rổ",
    room: "Sân đa năng 2",
    hour: "09:45",
    members: [1, 12, 13, 14, 15],
  },
  {
    name: "Cầu lông cơ bản - Kỹ thuật di chuyển",
    legacyTitle: "Cầu lông di chuyển",
    sport: "Cầu lông",
    room: "Sân đa năng 1",
    hour: "10:25",
    members: [1, 16, 17, 18, 19],
  },
].map(({ legacyTitle, ...slot }) => ({
  ...slot,
  legacyName: `DEMO Flow 4 21-11 - ${legacyTitle}`,
  scheduleTime: `${demoDate}T${slot.hour}:00`,
}));
const classNameKey = (name) =>
  name.toLocaleLowerCase("vi-VN").replaceAll(" ", "").replaceAll("-", "");

async function readPassword() {
  if (process.env.SPORTIVA_DEMO_MANAGER_PASSWORD) {
    return process.env.SPORTIVA_DEMO_MANAGER_PASSWORD;
  }
  if (!process.stdin.isTTY) {
    throw new Error("Mở terminal để nhập mật khẩu quản lý demo.");
  }
  const muted = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const input = createInterface({
    input: process.stdin,
    output: muted,
    terminal: true,
  });
  process.stdout.write(`Mật khẩu của ${managerEmail}: `);
  try {
    return await input.question("");
  } finally {
    input.close();
    process.stdout.write("\n");
  }
}

async function request(
  path,
  { token, body, method = "GET", optional = false } = {},
) {
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    throw new Error(
      `Không gọi được backend local (${method} ${path}): ${error.message}`,
    );
  }
  if (optional && response.status === 404) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      `${method} ${path} (${response.status}): ${data?.message || "Yêu cầu bị từ chối"}`,
    );
  if (data === null) throw new Error(`API không trả dữ liệu JSON tại ${path}.`);
  return data;
}

const time = (value) => Date.parse(`${value}+07:00`);
const timeZone = {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
};
const hour = (timestamp) =>
  new Intl.DateTimeFormat("vi-VN", timeZone).format(timestamp);
const booked = (rows) => rows.filter((row) => row.bookingStatus === "BOOKED");
function overlaps(item, slot) {
  const start = time(item.scheduleTime);
  const proposed = time(slot.scheduleTime);
  return (
    start < proposed + duration * 60_000 &&
    proposed < start + (item.durationMinutes ?? 60) * 60_000
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(
      "node scripts/prepare-flow4-demo.mjs [--check]\n--check chỉ kiểm tra, không tạo lớp hoặc booking.\n",
    );
    return;
  }
  if (args.length && (args.length !== 1 || args[0] !== "--check")) {
    throw new Error("Chỉ hỗ trợ --check và --help.");
  }
  const checkOnly = args.includes("--check");
  const password = await readPassword();
  if (!password) throw new Error("Vui lòng nhập mật khẩu quản lý demo.");
  const session = await request("/users/login", {
    method: "POST",
    body: { email: managerEmail, password },
  });
  if (session.user?.roleName !== "CENTER_MANAGER" || !session.token) {
    throw new Error("Tài khoản demo cần có vai trò Quản lý trung tâm.");
  }
  const token = session.token;
  const get = (path, optional = false) => request(path, { token, optional });
  const [users, classes, sports, rooms] = await Promise.all(
    ["/users", "/classes", "/sports", "/rooms"].map((path) => get(path)),
  );
  const scheduled = classes.filter((item) => item.status === "SCHEDULED");
  const demoClasses = slots.map((slot) => {
    const sport = sports.find((item) => item.sportName === slot.sport);
    const matches = classes.filter(
      (item) =>
        item.sportId === sport?.id &&
        (item.className === slot.legacyName ||
          (time(item.scheduleTime) === time(slot.scheduleTime) &&
            classNameKey(item.className) === classNameKey(slot.name))),
    );
    if (matches.length > 1)
      throw new Error(`Có nhiều lớp mang tên "${slot.name}".`);
    return matches[0];
  });
  const planIds = new Set(demoClasses.filter(Boolean).map((item) => item.id));
  const otherClasses = scheduled.filter((item) => !planIds.has(item.id));
  const coaches = coachEmails
    .map((email) =>
      users.find(
        (user) =>
          user.email === email &&
          user.roleName === "COACH" &&
          user.status === "ACTIVE",
      ),
    )
    .filter(Boolean);
  const coach = coaches.find(
    (candidate) =>
      demoClasses.every((item) => !item || item.coachId === candidate.id) &&
      slots.every(
        (slot) =>
          !otherClasses.some(
            (item) => item.coachId === candidate.id && overlaps(item, slot),
          ),
      ),
  );
  if (!coach)
    throw new Error("Cần tài khoản HLV mẫu có lịch trống cả ba ca sáng 21/11.");

  const sample = users.filter(
    (user) =>
      sampleMembers.test(user.email) &&
      user.roleName === "MEMBER" &&
      user.status === "ACTIVE",
  );
  const eligibility = new Map();
  async function eligible(member, slot) {
    if (!eligibility.has(member.id)) {
      const subscription = await get(
        `/memberships/members/${member.id}/active`,
        true,
      );
      const canBook =
        subscription?.status === "ACTIVE" &&
        subscription.startDate?.slice(0, 10) <= demoDate &&
        subscription.endDate?.slice(0, 10) >= demoDate;
      const bookings = canBook
        ? await get(`/members/${member.id}/bookings`)
        : [];
      eligibility.set(member.id, { canBook, bookings });
    }
    const { canBook, bookings } = eligibility.get(member.id);
    return (
      canBook &&
      !bookings.some(
        (booking) =>
          booking.status === "BOOKED" &&
          otherClasses.some(
            (item) => item.id === booking.classId && overlaps(item, slot),
          ),
      )
    );
  }

  const plan = [];
  for (const [index, slot] of slots.entries()) {
    const existing = demoClasses[index];
    const sport = sports.find((item) => item.sportName === slot.sport);
    const courts = rooms.filter(
      (item) =>
        ["Sân đa năng 1", "Sân đa năng 2"].includes(item.roomName) &&
        item.capacity >= 5 &&
        !otherClasses.some(
          (itemClass) =>
            itemClass.roomId === item.id && overlaps(itemClass, slot),
        ),
    );
    const room = existing
      ? courts.find((item) => item.id === existing.roomId)
      : (courts.find((item) => item.roomName === slot.room) ?? courts[0]);
    if (!sport || !room)
      throw new Error(`Thiếu bộ môn hoặc sân trống cho ca ${slot.hour}.`);
    if (
      existing &&
      (existing.sportId !== sport.id ||
        existing.coachId !== coach.id ||
        existing.durationMinutes !== duration ||
        existing.maxCapacity !== 5 ||
        existing.requiredAccessLevel !== "STANDARD" ||
        time(existing.scheduleTime) !== time(slot.scheduleTime) ||
        !["SCHEDULED", "COMPLETED"].includes(existing.status))
    )
      throw new Error(`Lớp "${slot.name}" đã tồn tại với thông tin khác.`);
    const currentRoster = existing
      ? booked(await get(`/classes/${existing.id}/students`))
      : [];
    const members = currentRoster.map((entry) =>
      sample.find((user) => user.id === entry.memberId),
    );
    if (members.length > 5 || members.some((user) => !user)) {
      throw new Error(`Lớp "${slot.name}" đang có danh sách ngoài dự kiến.`);
    }
    const alreadyBooked = members.length;
    if (alreadyBooked < 5 && time(slot.scheduleTime) <= Date.now()) {
      throw new Error(
        `Ca ${slot.hour} đã đến giờ. Cần chạy script trước khi lớp đầu tiên bắt đầu.`,
      );
    }
    const preferred = slot.members.map(memberEmail);
    const candidates = preferred
      .map((email) => sample.find((user) => user.email === email))
      .filter(Boolean);
    candidates.push(
      ...sample.filter((user) => !preferred.includes(user.email)),
    );
    for (const member of candidates) {
      if (members.length === 5) break;
      if (
        !members.some((user) => user.id === member.id) &&
        (await eligible(member, slot))
      )
        members.push(member);
    }
    if (members.length !== 5)
      throw new Error(
        `Ca ${slot.hour} cần 5 hội viên mẫu có gói còn hạn và lịch trống.`,
      );
    plan.push({ slot, existing, room, sport, members, alreadyBooked });
  }

  console.log(`HLV cho cả ba lớp: ${coach.fullName} (${coach.email})`);
  for (const item of plan) {
    console.log(
      `${item.slot.hour} · ${item.existing?.className ?? item.slot.name} · ${item.room.roomName} · ${item.members.length} học viên`,
    );
  }
  if (checkOnly) {
    console.log(
      "Kiểm tra đạt. Chạy lại lệnh không có --check để tạo dữ liệu còn thiếu.",
    );
    return;
  }
  for (const { slot, existing, room, sport, members, alreadyBooked } of plan) {
    const item =
      existing ??
      (await request("/classes", {
        token,
        method: "POST",
        body: {
          className: slot.name,
          sportId: sport.id,
          coachId: coach.id,
          roomId: room.id,
          scheduleTime: slot.scheduleTime,
          durationMinutes: duration,
          maxCapacity: 5,
          requiredAccessLevel: "STANDARD",
          status: "SCHEDULED",
        },
      }));
    for (const member of members.slice(alreadyBooked)) {
      const result = await request(
        `/classes/${item.id}/book?memberId=${member.id}`,
        { method: "POST", token },
      );
      if (result.status !== "BOOKED")
        throw new Error(`Chưa xác nhận booking cho ${member.fullName}.`);
    }
    const roster = booked(await get(`/classes/${item.id}/students`));
    const recorded = await get(`/attendance/classes/${item.id}`);
    if (
      roster.length !== 5 ||
      !members.every((member) =>
        roster.some((entry) => entry.memberId === member.id),
      )
    ) {
      throw new Error(`Lớp #${item.id} chưa có đúng 5 booking.`);
    }
    const start = time(item.scheduleTime);
    console.log(
      `#${item.id} · 5 đã đăng ký · ${recorded.length} đã điểm danh · khung ${hour(start - 15 * 60_000)}–${hour(start + (duration + 60) * 60_000)}`,
    );
    console.log(`${webBase}/attendance?classId=${item.id}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

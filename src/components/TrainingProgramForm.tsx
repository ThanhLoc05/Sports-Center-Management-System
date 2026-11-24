import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useCatalog } from "../lib/catalog";
import { localDate, dateLabel } from "../lib/utils";
import { trainingApi, weekday } from "../lib/training-api";
import type {
  ProgramKind,
  TrainingProgram,
  TrainingSlot,
  ProgramInput,
} from "../lib/training-api";
import { Field, FormModal, Notice, ErrorState, useToast } from "./ui";

export function courseEndDate(first: string, total: number, days: number[]) {
  if (!first || total < 1 || total > 520 || !days.length) return "";
  const date = new Date(first + "T12:00:00");
  if (!days.includes(((date.getDay() + 6) % 7) + 1)) return "";
  let count = 0;
  for (let i = 0; i <= total * 7; i++) {
    if (days.includes(((date.getDay() + 6) % 7) + 1) && ++count === total) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }
    date.setDate(date.getDate() + 1);
  }
  return "";
}

export function TrainingProgramForm({
  kind,
  item,
  onClose,
}: {
  kind: ProgramKind;
  item?: TrainingProgram;
  onClose: () => void;
}) {
  const course = kind === "COURSE",
    catalog = useCatalog(),
    client = useQueryClient(),
    toast = useToast();
  const coaches = useQuery({ queryKey: ["coaches"], queryFn: api.coaches });
  const [slots, setSlots] = useState<TrainingSlot[]>(
    item?.slots ||
      [1, 3, 5].map((dayOfWeek) => ({
        dayOfWeek,
        startTime: "17:50",
        endTime: "18:50",
        coachId: 0,
        roomId: 0,
      })),
  );
  const [start, setStart] = useState(item?.startDate || "");
  const [total, setTotal] = useState(item?.totalSessions || 12);
  const end = courseEndDate(
    start,
    total,
    slots.map((s) => s.dayOfWeek),
  );
  const update = (day: number, patch: Partial<TrainingSlot>) =>
    setSlots((old) =>
      old.map((s) => (s.dayOfWeek === day ? { ...s, ...patch } : s)),
    );
  return (
    <FormModal
      title={`${item ? "Chỉnh sửa" : "Tạo"} ${course ? "khóa học" : "lớp thường"}`}
      wide
      description={
        course
          ? "Học phí riêng và lịch trọn khóa. Hệ thống tính ngày kết thúc từ số buổi."
          : "Lịch cố định mỗi tuần. Lớp duy trì liên tục, quyền tham gia của học viên theo hạn gói."
      }
      onClose={onClose}
      submitDisabled={
        catalog.loading ||
        !!catalog.error ||
        coaches.isPending ||
        !!coaches.error
      }
      onSubmit={async (data) => {
        const input: ProgramInput = {
          name: String(data.get("name")).trim(),
          sportId: Number(data.get("sportId")),
          description: String(data.get("description")).trim(),
          trainingLevel: String(data.get("trainingLevel")),
          maxCapacity: Number(data.get("maxCapacity")),
          requiredAccessLevel: String(data.get("requiredAccessLevel")),
          slots: slots.map(
            ({ dayOfWeek, startTime, endTime, coachId, roomId }) => ({
              dayOfWeek,
              startTime,
              endTime,
              coachId,
              roomId,
            }),
          ),
          ...(course
            ? {
                startDate: start,
                totalSessions: total,
                price: Number(data.get("price")),
                discountEligible: data.get("discountEligible") === "on",
              }
            : {}),
        };
        await trainingApi.save(kind, input, item?.id);
        await client.invalidateQueries();
        toast("Đã lưu lịch học.");
      }}
    >
      {catalog.error && (
        <ErrorState error={catalog.error} retry={catalog.retry} />
      )}
      {coaches.error && (
        <ErrorState error={coaches.error} retry={coaches.refetch} />
      )}
      <div className="form-grid">
        <Field label={course ? "Tên khóa học" : "Tên lớp"}>
          <input
            name="name"
            required
            maxLength={150}
            defaultValue={item?.name}
          />
        </Field>
        <Field label="Bộ môn">
          <select name="sportId" required defaultValue={item?.sportId || ""}>
            <option value="">Chọn bộ môn</option>
            {Object.entries(catalog.sports).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Trình độ">
          <input
            name="trainingLevel"
            required
            maxLength={100}
            defaultValue={item?.trainingLevel || "Cơ bản"}
          />
        </Field>
        <Field label="Sĩ số tối đa">
          <input
            name="maxCapacity"
            type="number"
            required
            min={1}
            max={1000}
            defaultValue={item?.maxCapacity || 15}
          />
        </Field>
        <Field label="Gói được tham gia">
          <select
            name="requiredAccessLevel"
            defaultValue={item?.requiredAccessLevel || "STANDARD"}
          >
            <option value="STANDARD">Standard và VIP</option>
            <option value="VIP">Chỉ VIP</option>
          </select>
        </Field>
      </div>
      <Field label="Nội dung và lợi ích">
        <textarea
          name="description"
          required
          maxLength={2000}
          rows={3}
          defaultValue={item?.description}
          placeholder="Học viên sẽ học gì, phù hợp với ai, cần chuẩn bị gì..."
        />
      </Field>
      <fieldset className="training-days">
        <legend>Ngày học cố định trong tuần</legend>
        {[1, 2, 3, 4, 5, 6, 7].map((day) => (
          <label key={day}>
            <input
              type="checkbox"
              checked={slots.some((s) => s.dayOfWeek === day)}
              onChange={(e) =>
                setSlots((old) =>
                  e.target.checked
                    ? [
                        ...old,
                        {
                          ...old[0],
                          dayOfWeek: day,
                          startTime: old[0]?.startTime || "17:50",
                          endTime: old[0]?.endTime || "18:50",
                          coachId: old[0]?.coachId || 0,
                          roomId: old[0]?.roomId || 0,
                        },
                      ].sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                    : old.filter((s) => s.dayOfWeek !== day),
                )
              }
            />
            {weekday(day)}
          </label>
        ))}
      </fieldset>
      <p className="muted">
        {slots.length} buổi/tuần · Chọn 2 hoặc 3 ngày theo lịch muốn mở. Có thể
        phân công HLV khác nhau ở từng ngày.
      </p>
      {slots.map((slot) => (
        <div className="training-slot-input" key={slot.dayOfWeek}>
          <strong>{weekday(slot.dayOfWeek)}</strong>
          <Field label="Giờ bắt đầu">
            <input
              type="time"
              required
              value={slot.startTime.slice(0, 5)}
              onChange={(e) =>
                update(slot.dayOfWeek, { startTime: e.target.value })
              }
            />
          </Field>
          <Field label="Giờ kết thúc">
            <input
              type="time"
              required
              value={slot.endTime.slice(0, 5)}
              onChange={(e) =>
                update(slot.dayOfWeek, { endTime: e.target.value })
              }
            />
          </Field>
          <Field label="Huấn luyện viên">
            <select
              required
              value={slot.coachId || ""}
              onChange={(e) =>
                update(slot.dayOfWeek, { coachId: Number(e.target.value) })
              }
            >
              <option value="">Chọn HLV</option>
              {coaches.data?.map((c) => (
                <option key={c.coachId} value={c.coachId}>
                  {c.fullName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Phòng tập">
            <select
              required
              value={slot.roomId || ""}
              onChange={(e) =>
                update(slot.dayOfWeek, { roomId: Number(e.target.value) })
              }
            >
              <option value="">Chọn phòng</option>
              {catalog.roomRows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.capacity} chỗ
                </option>
              ))}
            </select>
          </Field>
        </div>
      ))}
      {course && (
        <>
          <div className="form-grid">
            <Field
              label="Ngày khai giảng"
              hint="Phải trùng một trong các thứ học đã chọn."
            >
              <input
                type="date"
                required
                min={localDate()}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="Tổng số buổi">
              <input
                type="number"
                required
                min={1}
                max={520}
                value={total}
                onChange={(e) => setTotal(Number(e.target.value))}
              />
            </Field>
            <Field label="Học phí trọn khóa (VND)">
              <input
                name="price"
                type="number"
                required
                min={1}
                max={999999999}
                step={1}
                defaultValue={item?.price || 1000000}
              />
            </Field>
          </div>
          <Notice>
            {end
              ? `Ngày kết thúc dự kiến: ${dateLabel(end)}. Học viên cần gói bao phủ đến ngày này.`
              : "Chọn ngày khai giảng đúng thứ học để tính ngày kết thúc."}
          </Notice>
          <label className="checkbox-line">
            <input
              type="checkbox"
              name="discountEligible"
              defaultChecked={item?.discountEligible ?? true}
            />{" "}
            Áp dụng ưu đãi học phí theo gói thành viên (VIP 10%)
          </label>
        </>
      )}
    </FormModal>
  );
}

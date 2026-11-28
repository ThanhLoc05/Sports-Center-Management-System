import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarPlus, History, Plus, RefreshCw, Search } from "lucide-react";
import {
  Button,
  Empty,
  ErrorState,
  Field,
  FormModal,
  Loading,
  Modal,
  Notice,
  PageHeader,
  Panel,
} from "../components/ui";
import { ApiError, api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCatalog } from "../lib/catalog";
import { SCHEDULING_SLOTS } from "../lib/scheduling-slots";
import { matchesSchedulingSport } from "../lib/scheduling-resources";
import type { AccessLevel, CoachProfessionalProfile } from "../lib/types";
import { dateLabel, localDate, parseDate, timeLabel } from "../lib/utils";
import {
  weeklyScheduleApi,
  type PreviewOccurrence,
  type Weekday,
  type WeeklyClass,
  type SavedWeeklyWindow,
  type WeeklySchedulePreview,
  type SyncMode,
  type SyncPreview,
} from "../lib/weekly-schedule-api";

const syncLabels = {
  CREATE: "Tạo mới",
  CANCEL: "Sẽ hủy",
  ORPHAN: "Buổi tập ngoài lịch mẫu",
  MISSING: "Thiếu buổi theo lịch mẫu",
  UPDATE: "Cập nhật",
  SKIP: "Giữ nguyên",
  CONFLICT: "Xung đột",
} as const;
import "../styles-manager-week-schedule.css";
import "../styles-weekly-schedule.css";
import ScheduleSportMarkers, { sportTone } from "../components/ScheduleSportMarkers";

const weekdays: { code: Weekday; label: string; short: string }[] = [
  { code: "MONDAY", label: "Thứ Hai", short: "T2" },
  { code: "TUESDAY", label: "Thứ Ba", short: "T3" },
  { code: "WEDNESDAY", label: "Thứ Tư", short: "T4" },
  { code: "THURSDAY", label: "Thứ Năm", short: "T5" },
  { code: "FRIDAY", label: "Thứ Sáu", short: "T6" },
  { code: "SATURDAY", label: "Thứ Bảy", short: "T7" },
  { code: "SUNDAY", label: "Chủ nhật", short: "CN" },
];
const durations = [1, 2, 4, 8, 12];
const slotFor = (code: string) =>
  SCHEDULING_SLOTS.find((slot) => slot.code === code);
const interval = (code: string) => {
  const slot = slotFor(code);
  return slot ? `${slot.start}–${slot.end}` : code;
};
const statusLabels = {
  READY: "Có thể tạo",
  EXISTS: "Đã tồn tại",
  CONFLICT: "Xung đột",
  EXCLUDED: "Đã loại trừ",
};
const offsetDate = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const weekdayIndex = (value: string) =>
  (new Date(value + "T00:00:00Z").getUTCDay() + 6) % 7;
const weekStartOf = (value: string) => offsetDate(value, -weekdayIndex(value));
const weekRange = (start: string) => dateLabel(start) + " – " + dateLabel(offsetDate(start, 6));
const messageFor = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Thao tác chưa thành công. Vui lòng thử lại.";
type Cell = { weekday: Weekday; slotCode: string };
type Entry = WeeklyClass & { id: number; sourceIndex?: number };
type Editor = { cell: Cell; entry?: Entry };

export default function WeeklySchedule() {
  const { session } = useAuth();
  const live = session?.mode === "api";
  const catalog = useCatalog();
  const client = useQueryClient();
  const coaches = useQuery({
    queryKey: ["coaches"],
    queryFn: api.coaches,
    enabled: live,
  });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const template = useQuery({
    queryKey: ["weekly-schedule-template", session?.user.id],
    queryFn: weeklyScheduleApi.template,
    enabled: live,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (!template.data || version !== null) return;
    setEntries(template.data.entries.map((entry, index) => ({ ...entry, id: index + 1, sourceIndex: index })));
    setVersion(template.data.version);
  }, [template.data, version]);
  const [cell, setCell] = useState<Cell | null>(null);
  const [mobileDay, setMobileDay] = useState<Weekday>("MONDAY");
  const [dialog, setDialog] = useState<"sync" | "publish" | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [startDate, setStartDate] = useState(() => offsetDate(localDate(), 1));
  const [weeks, setWeeks] = useState(4);
  const [preview, setPreview] = useState<WeeklySchedulePreview | null>(null);
  const [excludedKeys, setExcludedKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof weeklyScheduleApi.confirm>
  > | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [syncMode, setSyncMode] = useState<SyncMode>("FUTURE_PUBLISHED");
  const [syncWeek, setSyncWeek] = useState(() => localDate());
  const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null);
  const [includeOrphans, setIncludeOrphans] = useState(false);
  const [orphanIds, setOrphanIds] = useState<number[]>([]);
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  const [selectionDirty, setSelectionDirty] = useState(false);
  useEffect(() => {
    setSyncPreview(null);
    setOrphanIds([]);
    setMissingKeys([]);
    setSelectionDirty(false);
  }, [entries, syncMode, syncWeek, includeOrphans]);
  const cancellations = syncPreview?.changes.filter((change) => change.action === "CANCEL") ?? [];
  const orphanCandidates = syncPreview?.changes.filter((change) => change.action === "ORPHAN" && change.classId != null) ?? [];
  const missingCandidates = syncPreview?.changes.filter((change) => change.action === "MISSING" && change.placementKey) ?? [];
  const syncClasses = useQuery({
    queryKey: ["classes", undefined],
    queryFn: () => api.classes(),
    enabled: live && dialog === "sync" && includeOrphans && syncPreview?.changes.some((change) => change.classId != null),
  });
  const classesById = new Map(syncClasses.data?.map((item) => [item.id, item]));
  const selectedChanges = syncPreview?.changes.filter((change) =>
    (change.classId != null && orphanIds.includes(change.classId)) ||
    (change.placementKey != null && missingKeys.includes(change.placementKey))) ?? [];
  const selectedBooked = selectedChanges.reduce((total, change) => total + (change.booked ?? 0), 0);
  const selectedWaiting = selectedChanges.reduce((total, change) => total + (change.waitlisted ?? 0), 0);
  const foundChanges = syncPreview?.changes.filter((change) =>
    change.action === "ORPHAN" || change.action === "CANCEL" || change.placementKey != null).length ?? 0;
  const history = useQuery({
    queryKey: ["recurring-classes", session?.user.id],
    queryFn: weeklyScheduleApi.published,
    enabled: live && historyOpen,
  });
  const coachNames = Object.fromEntries(
    (coaches.data ?? []).map((coach) => [coach.coachId, coach.fullName]),
  );
  const { sports, rooms } = catalog;
  const cellEntries = (day: Weekday, code: string) =>
    entries.filter(
      (entry) => entry.slotCode === code && entry.weekdays.includes(day),
    );
  const counts = { READY: 0, EXISTS: 0, CONFLICT: 0, EXCLUDED: 0 };
  const byDate = new Map<string, PreviewOccurrence[]>();
  for (const occurrence of preview?.occurrences ?? []) {
    counts[occurrence.status]++;
    const day = byDate.get(occurrence.date) ?? [];
    day.push(occurrence);
    byDate.set(occurrence.date, day);
  }
  const previous = new Map<
    string,
    { plannedDate: string; classId: number }[]
  >();
  for (const published of history.data ?? []) {
    const series = previous.get(published.seriesKey) ?? [];
    series.push(published);
    previous.set(published.seriesKey, series);
  }

  function input(keys: string[]): SavedWeeklyWindow {
    return { version: version ?? 0, startDate, weeks, excludedKeys: keys };
  }

  async function saveTemplate() {
    if (busy || version === null || (!dirty && (syncMode === "TEMPLATE_ONLY" || !includeOrphans))) return;
    setBusy(true);
    setError("");
    try {
      const rows = entries.map(({ id: _id, sourceIndex: _source, ...entry }) => entry);
      const sync = {
        mode: syncMode,
        weekStart: syncMode === "SELECTED_WEEK" ? syncWeek : undefined,
        sourceIndices: entries.map((entry) => entry.sourceIndex ?? null),
        includeOrphans,
        orphanIds,
        missingKeys,
      };
      if (syncMode !== "TEMPLATE_ONLY" && (!syncPreview || selectionDirty)) {
        setSyncPreview(await weeklyScheduleApi.syncPreview(version, rows, sync));
        setSelectionDirty(false);
        return;
      }
      const next = syncMode === "TEMPLATE_ONLY"
        ? await weeklyScheduleApi.save(version, rows)
        : await weeklyScheduleApi.save(version, rows, { ...sync, token: syncPreview?.token });
      setVersion(next.version);
      setEntries(next.entries.map((entry, index) => ({ ...entry, id: index + 1, sourceIndex: index })));
      setDirty(false);
      setSaved(true);
      setDialog(null);
      setIncludeOrphans(false);
      setSyncPreview(null);
      client.setQueryData(["weekly-schedule-template", session?.user.id], next);
      if (syncMode !== "TEMPLATE_ONLY") {
        await Promise.all([
          client.invalidateQueries({ queryKey: ["classes"] }),
          client.invalidateQueries({ queryKey: ["managed-classes"] }),
          client.invalidateQueries({ queryKey: ["recurring-classes"] }),
        ]);
      }
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) setSyncPreview(null);
      setError(messageFor(failure));
    } finally {
      setBusy(false);
    }
  }

  async function getPreview(keys: string[]) {
    if (busy || !version || dirty) return;
    setBusy(true);
    setError("");
    try {
      const next = await weeklyScheduleApi.preview(input(keys));
      setPreview(next);
      setExcludedKeys(keys);
      setRefreshRequired(false);
    } catch (failure) {
      setError(messageFor(failure));
    } finally {
      setBusy(false);
    }
  }

  function startExclusions(occurrences: PreviewOccurrence[], exclude: boolean) {
    const keys = new Set(excludedKeys);
    for (const occurrence of occurrences) {
      if (exclude) keys.add(occurrence.key);
      else keys.delete(occurrence.key);
    }
    void getPreview([...keys]);
  }

  async function confirm() {
    if (busy || !preview || counts.CONFLICT || !counts.READY || refreshRequired) return;
    setBusy(true);
    setError("");
    try {
      setResult(
        await weeklyScheduleApi.confirm(input(excludedKeys), preview.token),
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: ["classes"] }),
        client.invalidateQueries({ queryKey: ["managed-classes"] }),
        client.invalidateQueries({ queryKey: ["recurring-classes"] }),
      ]);
    } catch (failure) {
      setError(messageFor(failure));
      if (failure instanceof ApiError && failure.status === 409)
        setRefreshRequired(true);
    } finally {
      setBusy(false);
    }
  }

  function resetPreview() {
    setPreview(null);
    setExcludedKeys([]);
    setResult(null);
    setRefreshRequired(false);
    setError("");
  }

  function openSync(reconcile: boolean) {
    setError("");
    setSyncMode("FUTURE_PUBLISHED");
    setIncludeOrphans(reconcile);
    setSyncPreview(null);
    setOrphanIds([]);
    setMissingKeys([]);
    setSelectionDirty(false);
    setDialog("sync");
  }

  const syncByDate = new Map<string, SyncPreview["changes"]>();
  for (const change of syncPreview?.changes ?? []) {
    const date = includeOrphans ? weekStartOf(change.date) : change.date;
    const group = syncByDate.get(date) ?? [];
    group.push(change);
    syncByDate.set(date, group);
  }

  function saveEntry(next: WeeklyClass, id?: number) {
    const errors = next.weekdays.flatMap((day) => {
      const label = weekdays.find((item) => item.code === day)?.label;
      return cellEntries(day, next.slotCode)
        .filter((entry) => entry.id !== id)
        .flatMap((entry) => {
          const resources = [
            entry.coachId === next.coachId &&
              `HLV ${coachNames[entry.coachId]}`,
            entry.roomId === next.roomId && `sân/phòng ${rooms[entry.roomId]}`,
          ].filter(Boolean);
          return resources.length
            ? [
                `${label} ${interval(next.slotCode)}: ${resources.join(", ")} trùng với ${entry.className}`,
              ]
            : [];
        });
    });
    if (errors.length) throw new Error(errors.join("; "));
    setDirty(true);
    setSaved(false);
    setEntries((current) =>
      id === undefined
        ? [...current, { ...next, id: (current.at(-1)?.id ?? 0) + 1 }]
        : current.map((entry) => (entry.id === id ? { ...next, id, sourceIndex: entry.sourceIndex } : entry)),
    );
  }

  return (
    <div className="weekly-schedule">
      <PageHeader title="Lịch tuần mẫu" description="Xếp lớp theo ca và áp dụng vào lịch hoạt động." />
      {!live ? (
        <Notice>
          Vui lòng đăng nhập bằng tài khoản quản lý để lập lịch tuần mẫu.
        </Notice>
      ) : (
        <>
          <Panel className="schedule-template-panel">
            <div className="schedule-template-toolbar">
              <div className="schedule-template-meta">
                <strong>{entries.reduce((sum, entry) => sum + entry.weekdays.length, 0)} lớp / tuần</strong>
                <span className={dirty ? "schedule-status schedule-status-dirty" : "schedule-status"} role="status">
                  {dirty ? "Chưa lưu thay đổi" : saved || (version ?? 0) > 0 ? "Đã lưu mẫu lịch." : version === null ? "Đang tải mẫu lịch…" : "Chưa có mẫu đã lưu"}
                </span>
              </div>
              <div className="schedule-toolbar-actions">
                <Button onClick={() => openSync(false)} disabled={!dirty || busy || version === null}><RefreshCw size={16} /> Lưu &amp; đồng bộ</Button>
                <Button variant="secondary" onClick={() => { resetPreview(); setDialog("publish"); }} disabled={!version || dirty || !entries.length || busy}><CalendarPlus size={16} /> Công bố lịch</Button>
                <Button variant="ghost" onClick={() => openSync(true)} disabled={dirty || version === null || busy}><Search size={16} /> Đối chiếu lịch tập</Button>
                <Button variant="ghost" onClick={() => setHistoryOpen(true)} disabled={busy}><History size={16} /> Lịch đã công bố</Button>
              </div>
            </div>
            {template.isPending && <Loading />}
            {template.isError && <ErrorState error={template.error} retry={template.refetch} />}
            <div className="schedule-legend-row">
              <span><ScheduleSportMarkers names={["Cầu lông"]} /> Cầu lông</span>
              <span><ScheduleSportMarkers names={["Yoga"]} /> Yoga</span>
              <span><ScheduleSportMarkers names={["Dance"]} /> Dance</span>
            </div>
            <div className="schedule-mobile-day">
              <Field label="Ngày trong tuần">
                <select value={mobileDay} onChange={(event) => setMobileDay(event.target.value as Weekday)}>
                  {weekdays.map((day) => <option key={day.code} value={day.code}>{day.label}</option>)}
                </select>
              </Field>
            </div>
                <div
                  className="manager-week-scroll"
                  role="region"
                  tabIndex={0}
                  aria-label="Ma trận lịch tuần mẫu"
                >
                  <table className="manager-week-table schedule-responsive-table">
                    <thead>
                      <tr>
                        <th scope="col">Ca học <small>GMT+7</small></th>
                        {weekdays.map((day) => (
                          <th key={day.code} scope="col" data-selected-day={day.code === mobileDay}>
                            {day.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SCHEDULING_SLOTS.map((slot) => (
                        <tr key={slot.code}>
                          <th scope="row">
                            {slot.label}
                            <small>{interval(slot.code)}</small>
                          </th>
                          {weekdays.map((day) => {
                            const items = cellEntries(day.code, slot.code);
                            const names = items.map((item) => sports[item.sportId] ?? `Bộ môn #${item.sportId}`);
                            const label = items.length
                              ? `${items.length} lớp`
                              : "Trống";
                            return (
                              <td key={day.code} data-selected-day={day.code === mobileDay}>
                                <button type="button"
                                  className="manager-week-cell" data-empty={!items.length}
                                  data-sport={sportTone(names)}
                                  disabled={busy || version === null}
                                  aria-label={`${day.label} · ${slot.label} · ${label}`}
                                  onClick={() =>
                                    setCell({
                                      weekday: day.code,
                                      slotCode: slot.code,
                                    })
                                  }
                                >
                                  {!items.length && <Plus size={15} aria-hidden="true" />}
                                  <strong>{label}</strong>
                                  <ScheduleSportMarkers names={names} />
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
          </Panel>
          {dialog === "sync" && (
            <Modal title={includeOrphans ? "Đối chiếu lịch tập" : "Lưu & đồng bộ"}
              description={includeOrphans ? "So sánh lịch mẫu với lịch đã công bố để chọn buổi cần bổ sung hoặc hủy." : "Chọn phạm vi và xem trước tác động trước khi áp dụng."}
              wide className={includeOrphans ? "schedule-ui-dialog schedule-reconcile-dialog" : "schedule-ui-dialog"} dismissible={!busy} onClose={() => setDialog(null)}>
              <div className="schedule-dialog-body">
                <div className="form-grid">
                  <Field label={includeOrphans ? "Phạm vi đối chiếu" : "Phạm vi áp dụng"}>
                  <select
                    aria-label={includeOrphans ? "Phạm vi đối chiếu" : "Phạm vi áp dụng khi lưu mẫu"}
                    disabled={busy}
                    value={syncMode}
                    onChange={(event) => setSyncMode(event.target.value as SyncMode)}
                  >
                    {!includeOrphans && <option value="TEMPLATE_ONLY">Chỉ lưu lịch mẫu</option>}
                    <option value="SELECTED_WEEK">{includeOrphans ? "Một tuần cụ thể" : "Áp dụng cho tuần được chọn"}</option>
                    <option value="FUTURE_PUBLISHED">{includeOrphans ? "Các tuần sắp tới đã công bố" : "Áp dụng cho các tuần tương lai đã công bố"}</option>
                  </select>
                  </Field>
                  {syncMode === "SELECTED_WEEK" && (
                    <Field label={includeOrphans ? "Chọn ngày trong tuần" : "Ngày trong tuần áp dụng"}
                      hint={includeOrphans && syncWeek ? weekRange(weekStartOf(syncWeek)) : undefined}>
                    <input
                      type="date"
                      aria-label={includeOrphans ? "Chọn ngày trong tuần" : "Ngày bất kỳ trong tuần cần áp dụng"}
                      min={localDate()}
                      disabled={busy}
                      value={syncWeek}
                      onChange={(event) => setSyncWeek(event.target.value)}
                    />
                    </Field>
                  )}
                </div>
                {syncPreview && (
                  <div className="weekly-schedule-sync" role="status">
                    {includeOrphans ? (
                      <>
                        <dl className="schedule-metrics" aria-label="Kết quả đối chiếu">
                          <div><dt>Buổi chênh lệch phát hiện</dt><dd>{foundChanges}</dd></div>
                          <div><dt>Buổi đã chọn xử lý</dt><dd>{orphanIds.length + missingKeys.length}</dd></div>
                          <div><dt>Lượt đăng ký bị ảnh hưởng</dt><dd>{selectedBooked}</dd></div>
                          <div><dt>Lượt chờ bị ảnh hưởng</dt><dd>{selectedWaiting}</dd></div>
                        </dl>
                        {syncPreview.changes.some((change) => change.action === "ORPHAN" || change.action === "CANCEL") && (
                          <p className="schedule-reconcile-help"><strong>Buổi tập ngoài lịch mẫu</strong> là buổi thuộc lịch mẫu cũ. Các buổi thêm trực tiếp vào Lịch hoạt động được giữ nguyên.</p>
                        )}
                      </>
                    ) : !selectionDirty && (
                      <dl className="schedule-metrics" aria-label="Tổng hợp thay đổi">
                        {(["CREATE", "UPDATE", "CANCEL", "CONFLICT", "SKIP"] as const).map((action) => (
                          <div key={action}><dt>{syncLabels[action]}</dt><dd>{syncPreview.changes.filter((change) => change.action === action).length}</dd></div>
                        ))}
                        <div><dt>Lượt đăng ký bị ảnh hưởng</dt><dd>{cancellations.reduce((n, c) => n + (c.booked ?? 0), 0)}</dd></div>
                        <div><dt>Lượt chờ bị ảnh hưởng</dt><dd>{cancellations.reduce((n, c) => n + (c.waitlisted ?? 0), 0)}</dd></div>
                      </dl>
                    )}
                    {!includeOrphans && !selectionDirty && cancellations.length > 0 && (
                      <p className="schedule-warning">{cancellations.length} buổi sẽ hủy · {cancellations.reduce((n, c) => n + (c.booked ?? 0), 0)} lượt đã đăng ký
                        {" · "}{cancellations.reduce((n, c) => n + (c.waitlisted ?? 0), 0)} lượt danh sách chờ</p>
                    )}
                    {selectionDirty && <p role="status">Lựa chọn đã đổi. Xem trước để kiểm tra trước khi áp dụng.</p>}
                    {includeOrphans && (orphanCandidates.length > 0 || missingCandidates.length > 0) && (
                      <div className="weekly-schedule-actions">
                        {orphanCandidates.length > 0 && (
                          <Button variant="secondary" disabled={busy} onClick={() => {
                            setOrphanIds([...new Set([...orphanIds, ...orphanCandidates.map((change) => change.classId!)])]);
                            setSelectionDirty(true);
                          }}>Chọn tất cả buổi ngoài mẫu ({orphanCandidates.length})</Button>
                        )}
                        {(orphanIds.length > 0 || missingKeys.length > 0) && (
                          <Button variant="secondary" disabled={busy} onClick={() => {
                            setOrphanIds([]);
                            setMissingKeys([]);
                            setSelectionDirty(true);
                          }}>Bỏ chọn tất cả</Button>
                        )}
                      </div>
                    )}
                    {syncPreview.changes.length === 0 ? (
                      <p>{includeOrphans ? "Lịch tập khớp với lịch mẫu trong phạm vi đã chọn." : "Không có lớp thực tế nào thay đổi trong phạm vi đã chọn."}</p>
                    ) : (
                      [...syncByDate].map(([date, changes], index) => (
                        <details key={date} className="weekly-schedule-date" open={index === 0 || changes.some((c) => c.action === "CONFLICT") || undefined}>
                          <summary>{includeOrphans ? weekRange(date) : dateLabel(date)} · {changes.length} buổi</summary>
                          <ul className="weekly-schedule-list">
                        {changes.map((change, index) => {
                          const candidates = includeOrphans && change.classId == null ? entries.filter((entry) =>
                            entry.className.trim() === change.className && entry.slotCode === change.slotCode &&
                            entry.weekdays.includes(weekdays[weekdayIndex(change.date)].code)) : [];
                          const resources = change.classId != null ? classesById.get(change.classId)
                            : candidates.length === 1 ? candidates[0] : undefined;
                          const slot = slotFor(change.slotCode);
                          const changeInterval = change.actualStart && slot
                            ? `${change.actualStart.slice(0, 5)}–${timeLabel(new Date(parseDate(`${change.date}T${change.actualStart}`).getTime() + slot.durationMinutes * 60_000).toISOString())}`
                            : interval(change.slotCode);
                          return (
                          <li key={index}>
                            {includeOrphans ? (
                              <>
                                <div className="schedule-reconcile-row">
                                  <strong>{change.className}</strong>
                                  <span className="schedule-reconcile-tag">{syncLabels[change.action]}</span>
                                </div>
                                <dl className="schedule-reconcile-details">
                                  <div><dt>Lịch tập</dt><dd>{dateLabel(change.date)} · {changeInterval}</dd></div>
                                  <div><dt>HLV</dt><dd>{resources ? coachNames[resources.coachId] ?? ("#" + resources.coachId) : "Chưa có thông tin"}</dd></div>
                                  <div><dt>Sân/phòng</dt><dd>{resources ? rooms[resources.roomId] ?? ("#" + resources.roomId) : "Chưa có thông tin"}</dd></div>
                                  <div><dt>Đăng ký</dt><dd>{change.booked ?? (change.classId == null ? 0 : "—")} lượt</dd></div>
                                </dl>
                              </>
                            ) : (
                              <><strong>{syncLabels[change.action]}</strong> · {dateLabel(change.date)}{" "}
                                {changeInterval} · {change.className}</>
                            )}
                            {change.message && <p>{change.message}</p>}
                            {!includeOrphans && change.booked != null && <p>{change.booked} lượt đã đăng ký · {change.waitlisted ?? 0} lượt danh sách chờ</p>}
                            {change.classId != null && (change.action === "ORPHAN" || orphanIds.includes(change.classId)) && (
                              <label className="check-option">
                                <input type="checkbox" aria-label={"Chọn hủy " + change.className + " ngày " + dateLabel(change.date)} disabled={busy} checked={orphanIds.includes(change.classId)}
                                  onChange={(event) => {
                                    setOrphanIds(event.target.checked
                                      ? [...orphanIds, change.classId!] : orphanIds.filter((id) => id !== change.classId));
                                    setSelectionDirty(true);
                                  }} />
                                {includeOrphans ? "Chọn hủy buổi" : ("Chọn hủy " + change.className + " ngày " + dateLabel(change.date))}
                              </label>
                            )}
                            {change.placementKey && (
                              <label className="check-option">
                                <input type="checkbox" aria-label={"Chọn bổ sung " + change.className + " ngày " + dateLabel(change.date)} disabled={busy} checked={missingKeys.includes(change.placementKey)}
                                  onChange={(event) => {
                                    setMissingKeys(event.target.checked
                                      ? [...missingKeys, change.placementKey!] : missingKeys.filter((key) => key !== change.placementKey));
                                    setSelectionDirty(true);
                                  }} />
                                {includeOrphans ? "Chọn bổ sung buổi" : ("Chọn bổ sung " + change.className + " ngày " + dateLabel(change.date))}
                              </label>
                            )}
                          </li>
                          );
                        })}
                          </ul>
                        </details>
                      ))
                    )}
                  </div>
                )}
                {error && <p className="form-error schedule-field-error" role="alert">{error}</p>}
              </div>
              <div className="modal-footer">
                {includeOrphans && selectedBooked > 0 && (
                  <p className="schedule-warning" role="status">
                    <strong>Có hội viên đã đăng ký.</strong> Nếu xác nhận hủy, {selectedBooked} lượt đăng ký cũng sẽ bị hủy.
                  </p>
                )}
                <Button variant="secondary" disabled={busy} onClick={() => setDialog(null)}>Đóng</Button>
                  <Button
                    loading={busy}
                    disabled={version === null || busy || (!selectionDirty && syncPreview?.changes.some((c) => c.action === "CONFLICT"))
                      || (!dirty && (syncMode === "TEMPLATE_ONLY" || !includeOrphans
                        || (!!syncPreview && !selectionDirty && !orphanIds.length && !missingKeys.length)))}
                    onClick={() => void saveTemplate()}
                  >
                    {syncMode === "TEMPLATE_ONLY" ? "Lưu mẫu" : !syncPreview || selectionDirty ? (includeOrphans ? (syncPreview ? "Xem trước xử lý" : "Đối chiếu") : "Xem trước thay đổi")
                      : cancellations.length ? `Xác nhận hủy ${cancellations.length} buổi và áp dụng` : "Lưu và áp dụng"}
                  </Button>
              </div>
            </Modal>
          )}
          {dialog === "publish" && (
            <Modal title={result ? "Đã xác nhận lịch" : preview ? "Xem trước lịch thực tế" : "Công bố lịch"}
              description={preview ? `${dateLabel(preview.startDate)} – ${dateLabel(preview.endDate)}` : "Chọn khoảng thời gian để sinh buổi từ mẫu đã lưu."}
              wide className="schedule-ui-dialog" dismissible={!busy} onClose={() => setDialog(null)}>
              {!preview && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void getPreview([]);
                  }}
                >
                  <div className="schedule-dialog-body">
                  <div className="form-grid">
                    <Field label="Ngày bắt đầu">
                      <input
                        type="date"
                        disabled={busy}
                        min={localDate()}
                        value={startDate}
                        required
                        onChange={(event) => setStartDate(event.target.value)}
                      />
                    </Field>
                    <Field label="Số tuần">
                      <select
                        value={weeks}
                        disabled={busy}
                        onChange={(event) =>
                          setWeeks(Number(event.target.value))
                        }
                      >
                        {durations.map((duration) => (
                          <option key={duration} value={duration}>
                            {duration} tuần
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {/^\d{4}-\d{2}-\d{2}$/.test(startDate) && (
                    <p>
                      Ngày kết thúc{" "}
                      <strong>
                        {dateLabel(offsetDate(startDate, weeks * 7 - 1))}
                      </strong>
                    </p>
                  )}
                  {error && (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  )}
                  </div>
                  <div className="modal-footer">
                  <Button variant="secondary" disabled={busy} onClick={() => setDialog(null)}>Đóng</Button>
                  <Button
                    type="submit"
                    loading={busy}
                    disabled={!entries.length || !version || dirty}
                  >
                    Xem trước lịch
                  </Button>
                  </div>
                </form>
              )}
          {preview && !result && (
            <>
              <div className="schedule-dialog-body">
              <div
                className="weekly-schedule-summary"
                role="status"
                aria-label="Tổng hợp buổi dự kiến"
              >
                <span>
                  <strong>{preview.occurrences.length}</strong> buổi dự kiến
                </span>
                {Object.entries(counts).map(([status, count]) => (
                  <span key={status}>
                    <strong>{count}</strong>{" "}
                    {statusLabels[
                      status as keyof typeof statusLabels
                    ].toLocaleLowerCase("vi")}
                  </span>
                ))}
              </div>
              {counts.CONFLICT > 0 && (
                <Notice tone="warning">
                  Hãy sửa lịch mẫu hoặc loại trừ các buổi bị xung đột trước khi
                  tạo lịch.
                </Notice>
              )}
              {[...byDate.entries()].map(([date, occurrences], index) => {
                const allExcluded = occurrences.every(
                  (item) => item.status === "EXCLUDED",
                );
                return (
                  <details
                    key={date}
                    className="weekly-schedule-date"
                    open={
                      index === 0 ||
                      occurrences.some((item) => item.status === "CONFLICT") ||
                      undefined
                    }
                  >
                    <summary>
                      {dateLabel(date, {
                        weekday: "long",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}{" "}
                      · {occurrences.length} buổi
                    </summary>
                    <Button
                      disabled={busy}
                      variant="secondary"
                      onClick={() => startExclusions(occurrences, !allExcluded)}
                    >
                      {allExcluded
                        ? "Đưa ngày này vào lại"
                        : "Loại trừ cả ngày"}
                    </Button>
                    <ul className="weekly-schedule-list">
                      {occurrences.map((item) => (
                        <li key={item.key}>
                          <strong>
                            {interval(item.slotCode)} · {item.className}
                          </strong>
                          <p>
                            {sports[item.sportId] ?? `Môn #${item.sportId}`} ·{" "}
                            {coachNames[item.coachId] ?? `HLV #${item.coachId}`}{" "}
                            · {rooms[item.roomId] ?? `Phòng #${item.roomId}`} ·{" "}
                            {item.maxCapacity} chỗ
                          </p>
                          <p>
                            <strong>{statusLabels[item.status]}</strong>
                            {item.message && ` · ${item.message}`}
                            {item.classId && (
                              <>
                                {" "}
                                ·{" "}
                                <Link to={`/classes?classId=${item.classId}`}>
                                  {item.status === "EXISTS"
                                    ? "Xem buổi đã có"
                                    : "Xem buổi liên quan"}
                                </Link>
                              </>
                            )}
                          </p>
                          <label className="check-option">
                            <input
                              type="checkbox"
                              checked={item.status === "EXCLUDED"}
                              disabled={busy}
                              onChange={(event) =>
                                startExclusions([item], event.target.checked)
                              }
                            />
                            Loại trừ buổi {item.className}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              </div>
              <div className="modal-footer">
                <Button variant="secondary" disabled={busy} onClick={resetPreview}>
                  Quay lại
                </Button>
                {refreshRequired && (
                  <Button
                    variant="secondary"
                    loading={busy}
                    onClick={() => void getPreview(excludedKeys)}
                  >
                    Xem trước lại
                  </Button>
                )}
                <Button
                  loading={busy}
                  disabled={
                    refreshRequired || counts.CONFLICT > 0 || !counts.READY
                  }
                  onClick={() => void confirm()}
                >
                  Tạo và công bố {counts.READY} buổi
                </Button>
              </div>
            </>
          )}
          {result && (
            <>
              <div className="schedule-dialog-body">
              <div className="weekly-schedule-summary" role="status">
                <strong>{result.created} buổi đã tạo</strong>
                <span>{result.alreadyExisted} buổi đã tồn tại</span>
                <span>{result.excluded} buổi đã loại trừ</span>
              </div>
              </div>
              <div className="modal-footer">
                <Link className="btn btn-primary" to="/schedule">
                  Xem Lịch hoạt động
                </Link>
                <Link className="btn btn-secondary" to="/classes">
                  Xem Danh sách buổi học
                </Link>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setDialog(null)}
                >
                  Đóng
                </Button>
              </div>
            </>
          )}
            </Modal>
          )}
          {historyOpen && (
            <Modal title="Lịch đã công bố" wide className="schedule-ui-dialog" onClose={() => setHistoryOpen(false)}>
            <div className="schedule-dialog-body">
            {historyOpen &&
              (history.isPending ? (
                <Loading />
              ) : history.error ? (
                <ErrorState error={history.error} retry={history.refetch} />
              ) : history.data.length === 0 ? (
                <Empty title="Chưa công bố buổi nào theo lịch tuần mẫu." />
              ) : (
                [...previous.entries()].map(([key, items]) => (
                  <details className="weekly-schedule-date" key={key}>
                    <summary>
                      Chuỗi buổi #{items[0].classId} ·{" "}
                      {dateLabel(items[0].plannedDate)} · {items.length} buổi
                    </summary>
                    <ul className="weekly-schedule-list">
                      {items.map((item) => (
                        <li key={item.classId}>
                          <Link to={`/classes?classId=${item.classId}`}>
                            Buổi #{item.classId} · {dateLabel(item.plannedDate)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))
              ))}
            </div>
            </Modal>
          )}
          {cell && !editor && (
            <Modal
              title={`${weekdays.find((day) => day.code === cell.weekday)?.label} · ${slotFor(cell.slotCode)?.label} · ${interval(cell.slotCode)}`}
              description="Xóa cấu hình khỏi mẫu sẽ bỏ lớp khỏi tất cả ngày đã chọn trong cấu hình đó."
              onClose={() => setCell(null)}
              wide className="schedule-ui-dialog"
            >
              <div className="schedule-dialog-body">
              {cellEntries(cell.weekday, cell.slotCode).length ? (
                <ul className="weekly-schedule-list">
                  {cellEntries(cell.weekday, cell.slotCode).map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.className}</strong>
                      <p>
                        {sports[entry.sportId]} · {coachNames[entry.coachId]} ·{" "}
                        {rooms[entry.roomId]} · {entry.maxCapacity} chỗ
                      </p>
                      <p>
                        {entry.weekdays
                          .map(
                            (day) =>
                              weekdays.find((item) => item.code === day)?.short,
                          )
                          .join(", ")}
                      </p>
                      <div className="weekly-schedule-actions">
                        <Button
                          variant="secondary"
                          onClick={() => setEditor({ cell, entry })}
                          aria-label={`Chỉnh sửa ${entry.className}`}
                        >
                          Chỉnh sửa cấu hình
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setDirty(true);
                            setSaved(false);
                            setEntries((current) =>
                              current.filter((item) => item.id !== entry.id),
                            );
                          }}
                          aria-label={`Xóa ${entry.className} khỏi mẫu`}
                        >
                          Xóa khỏi mẫu
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="Khung lịch đang trống." />
              )}
              </div>
              <div className="modal-footer">
              <Button variant="secondary" onClick={() => setCell(null)}>Đóng</Button>
              <Button
                onClick={() => setEditor({ cell })}
                disabled={entries.length >= 100}
              >
                <Plus size={16} /> Thêm lớp
              </Button>
              </div>
            </Modal>
          )}
          {editor && (
            <WeeklyClassForm
              editor={editor}
              catalog={catalog}
              coaches={coaches.data ?? []}
              coachLoading={coaches.isPending}
              coachError={coaches.error}
              retryCoaches={coaches.refetch}
              dismiss={() => setEditor(null)}
              save={saveEntry}
            />
          )}
        </>
      )}
    </div>
  );
}

function WeeklyClassForm({
  editor,
  catalog,
  coaches,
  coachLoading,
  coachError,
  retryCoaches,
  dismiss,
  save,
}: {
  editor: Editor;
  catalog: ReturnType<typeof useCatalog>;
  coaches: CoachProfessionalProfile[];
  coachLoading: boolean;
  coachError: Error | null;
  retryCoaches: () => unknown;
  dismiss: () => void;
  save: (entry: WeeklyClass, id?: number) => void;
}) {
  const { entry, cell } = editor;
  const [sportId, setSportId] = useState(entry?.sportId ?? 0);
  const [coachId, setCoachId] = useState(entry?.coachId ?? 0);
  const [roomId, setRoomId] = useState(entry?.roomId ?? 0);
  const eligibleCoaches = sportId ? coaches.filter(({ specialties }) =>
    matchesSchedulingSport(specialties, sportId, catalog.sports)) : [];
  const eligibleRooms = sportId ? catalog.roomRows.filter(({ name }) =>
    matchesSchedulingSport(name, sportId, catalog.sports)) : [];
  const capacityLimit = eligibleRooms.find((room) => room.id === roomId)?.capacity;
  return (
    <FormModal
      title={entry ? "Chỉnh sửa cấu hình lớp" : "Thêm lớp vào lịch tuần mẫu"}
      description="Thay đổi được giữ trong bản nháp cho đến khi bạn lưu mẫu."
      className="schedule-ui-dialog"
      onClose={dismiss}
      wide
      submitLabel="Lưu vào mẫu"
      submitDisabled={
        catalog.loading || !!catalog.error || coachLoading || !!coachError
      }
      onSubmit={async (form) => {
        const days = form.getAll("weekday") as Weekday[];
        const className = String(form.get("className")).trim();
        const capacity = Number(form.get("maxCapacity"));
        const roomId = Number(form.get("roomId"));
        const room = catalog.roomRows.find((item) => item.id === roomId);
        if (!days.length) throw new Error("Chọn ít nhất một ngày trong tuần.");
        if (className.length < 2)
          throw new Error("Tên lớp phải có ít nhất hai ký tự.");
        if (!room || capacity > room.capacity)
          throw new Error(
            "Sức chứa lớp không được vượt quá sức chứa sân/phòng.",
          );
        save(
          {
            className,
            sportId: Number(form.get("sportId")),
            coachId: Number(form.get("coachId")),
            roomId,
            maxCapacity: capacity,
            weekdays: days,
            slotCode: String(form.get("slotCode")),
            requiredAccessLevel: form.get("requiredAccessLevel") as AccessLevel,
          },
          entry?.id,
        );
      }}
    >
      {(catalog.loading || coachLoading) && <Loading />}
      {catalog.error && (
        <ErrorState error={catalog.error} retry={catalog.retry} />
      )}
      {coachError && <ErrorState error={coachError} retry={retryCoaches} />}
      <Field label="Tên lớp học">
        <input
          name="className"
          required
          minLength={2}
          maxLength={100}
          defaultValue={entry?.className}
        />
      </Field>
      <fieldset className="weekly-schedule-days">
        <legend>Ngày trong tuần</legend>
        {weekdays.map((day) => (
          <label key={day.code} className="check-option">
            <input
              type="checkbox"
              name="weekday"
              value={day.code}
              defaultChecked={
                entry?.weekdays.includes(day.code) ?? day.code === cell.weekday
              }
            />
            {day.label}
          </label>
        ))}
      </fieldset>
      <div className="form-grid">
        <Field label="Ca học">
          <select
            name="slotCode"
            defaultValue={entry?.slotCode ?? cell.slotCode}
            required
          >
            {SCHEDULING_SLOTS.map((slot) => (
              <option value={slot.code} key={slot.code}>
                {slot.label} · {interval(slot.code)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bộ môn">
          <select name="sportId" value={sportId || ""} onChange={(event) => setSportId(Number(event.target.value))} required>
            <option value="" disabled>
              Chọn bộ môn
            </option>
            {Object.entries(catalog.sports).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Huấn luyện viên">
          <select name="coachId" required disabled={!sportId}
            value={eligibleCoaches.some((coach) => coach.coachId === coachId) ? coachId : ""}
            onChange={(event) => setCoachId(Number(event.target.value))}>
            <option value="" disabled>
              Chọn huấn luyện viên
            </option>
            {eligibleCoaches.map((coach) => (
              <option key={coach.coachId} value={coach.coachId}>
                {coach.fullName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sân/phòng">
          <select name="roomId" required disabled={!sportId}
            value={eligibleRooms.some((room) => room.id === roomId) ? roomId : ""}
            onChange={(event) => setRoomId(Number(event.target.value))}>
            <option value="" disabled>
              Chọn sân/phòng
            </option>
            {eligibleRooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} · {room.capacity} chỗ
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sức chứa" hint={capacityLimit ? `Tối đa ${capacityLimit} chỗ theo phòng đã chọn.` : undefined}>
          <input
            name="maxCapacity"
            type="number"
            min={1}
            max={500}
            step={1}
            required
            defaultValue={entry?.maxCapacity}
          />
        </Field>
        <Field label="Cấp độ yêu cầu">
          <select
            name="requiredAccessLevel"
            defaultValue={entry?.requiredAccessLevel ?? "STANDARD"}
            required
          >
            <option value="STANDARD">STANDARD</option>
            <option value="VIP">VIP</option>
          </select>
        </Field>
      </div>
    </FormModal>
  );
}

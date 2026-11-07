import { useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { useClasses, useUsers } from "../lib/hooks";
import { useAssignedStudents } from "../lib/use-coach-data";
import { operations } from "../lib/operations-api";
import {
  getNotificationStreamStatus,
  getReceivedNotifications,
  notificationsApi,
  subscribeNotificationStreamStatus,
  subscribeReceivedNotifications,
} from "../lib/notifications-api";
import type {
  NotificationEvent,
  NotificationSendResult,
} from "../lib/notifications-api";
import { errorText } from "../lib/utils";
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
  useToast,
} from "./ui";

type Audience = "class" | "member";
type NotificationKind = "GENERAL" | "HOMEWORK";

interface Draft {
  audience: Audience;
  targetId: number;
  audienceLabel: string;
  recipientIds: number[];
  recipientNames: string[];
  title: string;
  content: string;
  kind: NotificationKind;
  coachId?: number;
}

function notificationTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

export function ApiNotificationInbox() {
  const received = useSyncExternalStore(
    subscribeReceivedNotifications,
    getReceivedNotifications,
    getReceivedNotifications,
  );
  const stream = useSyncExternalStore(
    subscribeNotificationStreamStatus,
    getNotificationStreamStatus,
    getNotificationStreamStatus,
  );
  const streamMessage: Record<typeof stream.status, string> = {
    disconnected: "Luồng nhận thông báo chưa kết nối.",
    connecting: "Đang kết nối luồng thông báo…",
    connected:
      "Đang nhận thông báo trực tuyến. Người gửi và người nhận cần đăng nhập cùng lúc.",
    reconnecting: "Mất kết nối tạm thời; hệ thống đang thử kết nối lại.",
    error: "Không thể mở luồng nhận thông báo.",
  };
  return (
    <>
      <Notice tone={stream.status === "error" ? "warning" : "info"}>
        {stream.status === "reconnecting" && stream.error
          ? `${streamMessage[stream.status]} ${stream.error}`
          : stream.status === "error" && stream.error
            ? `${streamMessage[stream.status]} ${stream.error}`
            : streamMessage[stream.status]}
        {" "}
        Thông báo chỉ được giữ tạm trong phiên hiện tại; người nhận offline
        không nhận lại sau khi kết nối.
      </Notice>
      <Panel title="Thông báo nhận được trong phiên này">
        {received.length === 0 ? (
          <Empty
            title="Chưa nhận thông báo nào"
            description="Thông báo sẽ xuất hiện khi có người gửi trong lúc bạn đang kết nối."
          />
        ) : (
          <div>
            {received.map((event: NotificationEvent) => {
              const link =
                event.link ||
                (event.kind === "HOMEWORK" ? "/training" : undefined);
              return (
                <article
                  key={event.id}
                  style={{
                    borderBottom: "1px solid var(--border-card)",
                    padding: "1rem 0",
                  }}
                >
                  <div>
                    <strong>{event.title}</strong>
                    <p style={{ whiteSpace: "pre-wrap" }}>{event.content}</p>
                    <small>
                      {event.kind === "HOMEWORK" ? "Bài tập" : "Thông báo"} ·{" "}
                      {notificationTime(event.createdAt)}
                    </small>
                    {link && (
                      <p>
                        <Link to={link}>Mở nội dung liên quan</Link>
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </>
  );
}

export default function ApiNotifications() {
  const { session } = useAuth();
  const classes = useClasses();
  const users = useUsers();
  const students = useAssignedStudents();
  const toast = useToast();
  const [compose, setCompose] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [audience, setAudience] = useState<Audience>("class");
  const [target, setTarget] = useState("");
  const [kind, setKind] = useState<NotificationKind>("GENERAL");
  const [coachId, setCoachId] = useState("");
  const [review, setReview] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastSend, setLastSend] = useState<NotificationSendResult | null>(null);

  const classTarget =
    audience === "class" && target ? Number(target) : undefined;
  const classRoster = useQuery({
    queryKey: ["notification-class-roster", classTarget],
    queryFn: () => operations.students(classTarget!),
    enabled: session?.mode === "api" && classTarget !== undefined,
    retry: false,
  });
  const role = session?.user.roleName;
  const memberOptions =
    role === "COACH"
      ? students.data
      : (users.data || [])
          .filter(
            (user) =>
              user.roleName === "MEMBER" && user.status === "ACTIVE",
          )
          .map((user) => ({
            memberId: user.id,
            fullName: user.fullName,
            email: user.email,
            phone: user.phone,
            bookingStatus: "BOOKED",
            bookedAt: "",
          }));
  const activeRecipients =
    audience === "class"
      ? (classRoster.data || []).filter(
          (student) => student.bookingStatus === "BOOKED",
        )
      : memberOptions.filter(
          (student) => student.memberId === Number(target),
        );
  const activeClass = classes.data?.find((item) => item.id === classTarget);
  const canSend = role === "CENTER_MANAGER" || role === "COACH";
  const coaches = (users.data || []).filter(
    (user) => user.roleName === "COACH" && user.status === "ACTIVE",
  );
  const formLoading =
    audience === "class"
      ? classTarget !== undefined && classRoster.isPending
      : role === "COACH" ? students.isPending : users.isPending;
  const formError =
    audience === "class"
      ? classTarget !== undefined && classRoster.error
      : role === "COACH" ? students.error : users.error;
  const noRecipients =
    !formLoading &&
    !formError &&
    (activeRecipients.length === 0 || activeRecipients.length > 100);
  const submitDisabled =
    !target ||
    formLoading ||
    !!formError ||
    noRecipients ||
    (kind === "HOMEWORK" &&
      role !== "COACH" &&
      !(audience === "class" ? activeClass?.coachId : Number(coachId)));

  const openComposer = () => {
    setAudience(draft?.audience || "class");
    setTarget(draft ? String(draft.targetId) : "");
    setKind(draft?.kind || "GENERAL");
    setCoachId(draft?.coachId ? String(draft.coachId) : "");
    setCompose(true);
  };

  async function sendDraft() {
    if (!draft) return;
    setSending(true);
    try {
      const result = await notificationsApi.send({
        recipientIds: draft.recipientIds,
        title: draft.title,
        content: draft.content,
        kind: draft.kind,
        ...(draft.coachId ? { coachId: draft.coachId } : {}),
      });
      setLastSend(result);
      setDraft(null);
      setReview(false);
      toast(
        `${result.onlineRecipientsAtSend}/${result.acceptedRecipients} học viên online đã nhận thông báo.`,
      );
    } catch (error) {
      toast(errorText(error), "error");
    } finally {
      setSending(false);
    }
  }

  const createDraft = (data: FormData) => {
    const selectedTarget = Number(data.get("target"));
    const selectedClass =
      audience === "class"
        ? classes.data?.find((item) => item.id === selectedTarget)
        : undefined;
    const recipients =
      audience === "class"
        ? (classRoster.data || []).filter(
            (student) =>
              student.bookingStatus === "BOOKED" &&
              student.memberId > 0,
          )
        : memberOptions.filter(
              (student) => student.memberId === selectedTarget,
            );
    const selectedCoachId =
      kind !== "HOMEWORK"
        ? undefined
        : role === "COACH"
          ? session!.user.id
          : audience === "class"
            ? selectedClass?.coachId
            : Number(coachId);
    const targetLabel =
      audience === "class"
        ? selectedClass?.className
        : memberOptions.find((student) => student.memberId === selectedTarget)
            ?.fullName;

    if (!targetLabel || recipients.length === 0 || recipients.length > 100)
      throw new Error("Không có danh sách học viên hợp lệ để gửi.");

    setDraft({
      audience,
      targetId: selectedTarget,
      audienceLabel:
        audience === "class"
          ? `${targetLabel} · ${recipients.length} học viên`
          : targetLabel,
      recipientIds: recipients.map((student) => student.memberId),
      recipientNames: recipients.map((student) => student.fullName),
      title: String(data.get("title")).trim(),
      content: String(data.get("content")).trim(),
      kind,
      coachId: selectedCoachId,
    });
    setLastSend(null);
    setReview(true);
  };

  return (
    <>
      <PageHeader
        title="Thông báo & bài tập"
        description="Gửi thông báo trực tuyến hoặc giao bài tập cho học viên."
        actions={
          canSend ? (
            <Button onClick={openComposer}>Soạn thông báo / bài tập</Button>
          ) : undefined
        }
      />
      <ApiNotificationInbox />
      {lastSend && (
        <Notice>
          Kết quả gửi gần nhất: {lastSend.onlineRecipientsAtSend}/
          {lastSend.acceptedRecipients} học viên đang online
          {lastSend.workoutPlanIds.length > 0 &&
            ` · đã tạo ${lastSend.workoutPlanIds.length} kế hoạch tập luyện`}
          .
        </Notice>
      )}
      {compose && (
        <FormModal
          title="Soạn thông báo hoặc bài tập"
          wide
          submitLabel="Xem trước nội dung"
          submitDisabled={submitDisabled}
          onClose={() => setCompose(false)}
          onSubmit={async (data) => {
            try {
              createDraft(data);
              setCompose(false);
            } catch (error) {
              toast(errorText(error), "error");
              throw error;
            }
          }}
        >
          <Field label="Loại nội dung">
            <select
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as NotificationKind)
              }
            >
              <option value="GENERAL">Thông báo</option>
              <option value="HOMEWORK">Bài tập về nhà</option>
            </select>
          </Field>
          <Field label="Gửi đến">
            <select
              value={audience}
              onChange={(event) => {
                setAudience(event.target.value as Audience);
                setTarget("");
              }}
            >
              <option value="class">Cả lớp</option>
              <option value="member">Một học viên</option>
            </select>
          </Field>
          {classes.error && audience === "class" ? (
            <ErrorState error={classes.error} retry={classes.refetch} />
          ) : audience === "class" && classTarget !== undefined && classRoster.error ? (
            <ErrorState
              error={classRoster.error}
              retry={() => void classRoster.refetch()}
            />
          ) : audience === "member" && formError ? (
            <ErrorState
              error={formError}
              retry={() => {
                if (role === "COACH") students.refetch();
                else users.refetch();
              }}
            />
          ) : (
            <Field
              label={
                audience === "class"
                  ? "Lớp nhận thông báo"
                  : "Học viên nhận thông báo"
              }
            >
              <select
                name="target"
                required
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              >
                <option value="">Chọn {audience === "class" ? "lớp" : "học viên"}</option>
                {audience === "class"
                  ? classes.data
                      ?.filter((item) => item.status !== "CANCELLED")
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.className}
                        </option>
                      ))
                  : memberOptions.map((student) => (
                      <option key={student.memberId} value={student.memberId}>
                        {student.fullName}
                      </option>
                    ))}
              </select>
            </Field>
          )}
          {formLoading && <Loading />}
          {target && !formLoading && !formError && noRecipients && (
            <Notice tone="warning">
              {activeRecipients.length > 100
                ? "Một lần gửi tối đa 100 học viên."
                : "Không có học viên đang đăng ký ở lớp/người nhận đã chọn."}
            </Notice>
          )}
          {kind === "HOMEWORK" && role !== "COACH" && audience === "member" && (
            <Field label="Huấn luyện viên phụ trách bài tập">
              <select
                value={coachId}
                onChange={(event) => setCoachId(event.target.value)}
                required
              >
                <option value="">Chọn huấn luyện viên</option>
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.fullName}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {kind === "HOMEWORK" && role === "COACH" && (
            <Notice>Bài tập sẽ được lưu vào giáo án dưới tài khoản của bạn.</Notice>
          )}
          <Field label="Tiêu đề">
            <input
              name="title"
              required
              minLength={1}
              maxLength={150}
              defaultValue={draft?.title}
            />
          </Field>
          <Field label="Nội dung / bài tập về nhà">
            <textarea
              name="content"
              required
              minLength={1}
              maxLength={4000}
              rows={8}
              defaultValue={draft?.content}
            />
          </Field>
          {formError && (
            <p className="muted">
              Chưa tải được danh sách người nhận; hãy tải lại trước khi xem trước.
            </p>
          )}
        </FormModal>
      )}
      {review && draft && (
        <Modal
          className="content-preview-dialog"
          title="Xem trước thông báo"
          onClose={() => setReview(false)}
          dismissible={!sending}
        >
          <p>
            <strong>Người nhận:</strong> {draft.audienceLabel}
          </p>
          {draft.recipientNames.length <= 10 && (
            <p>{draft.recipientNames.join(", ")}</p>
          )}
          <p>
            <strong>Loại:</strong>{" "}
            {draft.kind === "HOMEWORK" ? "Bài tập về nhà" : "Thông báo"}
          </p>
          <h3>{draft.title}</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{draft.content}</p>
          <Notice>
            Khi gửi, người đang online sẽ nhận ngay qua SSE. Thông báo không lưu lịch sử; bài tập được lưu thành kế hoạch tập luyện.
          </Notice>
          <div className="modal-footer">
            <Button
              variant="secondary"
              disabled={sending}
              onClick={() => {
                setReview(false);
                setTarget(
                  String(draft.targetId),
                );
                setAudience(draft.audience);
                setKind(draft.kind);
                setCoachId(draft.coachId ? String(draft.coachId) : "");
                setCompose(true);
              }}
            >
              Chỉnh sửa
            </Button>
            <Button loading={sending} onClick={() => void sendDraft()}>
              Gửi thông báo
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

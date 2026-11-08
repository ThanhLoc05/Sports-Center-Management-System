import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getSession } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useClasses, useUsers } from "../lib/hooks";
import { useAssignedStudents } from "../lib/use-coach-data";
import { operations } from "../lib/operations-api";
import {
  getNotificationStreamStatus,
  getReceivedNotifications,
  notificationsApi,
  mergeNotificationItems,
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
  const { session } = useAuth();
  return <NotificationInbox key={`${session?.mode}:${session?.user.id}`} />;
}

function NotificationInbox() {
  const { session } = useAuth();
  const client = useQueryClient();
  const toast = useToast();
  const streamWasReconnecting = useRef(false);
  const key = ["notification-history", session?.user.id];
  const history = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => notificationsApi.history(pageParam),
    initialPageParam: 0,
    getNextPageParam: (page) => (page.hasNext ? page.page + 1 : undefined),
    enabled: session?.mode === "api",
    retry: false,
  });
  const read = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: async (item) => {
      if (
        getSession()?.token !== session?.token ||
        getSession()?.user.id !== session?.user.id
      )
        return;
      client.setQueryData(
        key,
        (old: typeof history.data) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              content: page.content.map((row) =>
                row.id === item.id ? item : row,
              ),
            })),
          },
      );
      setReadItems((previous) => ({ ...previous, [item.id]: item }));
    },
    onError: (error) => {
      if (getSession()?.token === session?.token)
        toast(errorText(error), "error");
    },
  });
  const [readItems, setReadItems] = useState<Record<number, NotificationEvent>>(
    {},
  );
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
  useEffect(() => {
    if (stream.status === "reconnecting") {
      streamWasReconnecting.current = true;
      return;
    }
    if (
      stream.status === "connected" &&
      streamWasReconnecting.current &&
      session?.mode === "api"
    ) {
      streamWasReconnecting.current = false;
      void client.invalidateQueries({ queryKey: key });
      return;
    }
    if (stream.status === "disconnected" || stream.status === "error") {
      streamWasReconnecting.current = false;
    }
  }, [client, session?.mode, stream.status, session?.user.id]);
  const items = mergeNotificationItems(
    history.data?.pages.flatMap((page) => page.content) || [],
    received,
  ).map((item) =>
    item.kind === "GENERAL" ? readItems[item.id] || item : item,
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
            : streamMessage[stream.status]}{" "}
        Thông báo GENERAL được lưu trong lịch sử của bạn. Bài tập HOMEWORK vẫn
        được xem trong kế hoạch tập luyện.
      </Notice>
      <Panel title="Thông báo của bạn">
        {history.isPending && <Loading />}
        {history.error && (
          <ErrorState
            error={history.error}
            retry={() => void history.refetch()}
          />
        )}
        {!history.isPending && !history.error && items.length === 0 ? (
          <Empty
            title="Chưa nhận thông báo nào"
            description="Thông báo sẽ xuất hiện khi huấn luyện viên gửi cho bạn."
          />
        ) : (
          <div>
            {items.map((event: NotificationEvent) => {
              const link =
                event.link ||
                (event.kind === "HOMEWORK" ? "/training" : undefined);
              return (
                <article
                  key={`${event.kind}:${event.id}:${event.createdAt}`}
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
                      {notificationTime(event.createdAt)} · Người gửi #
                      {event.senderId}
                    </small>
                    {event.kind === "GENERAL" && (
                      <p>
                        {event.readAt ? (
                          "Đã đọc"
                        ) : (
                          <Button
                            variant="ghost"
                            disabled={read.isPending}
                            onClick={() => read.mutate(event.id)}
                          >
                            Đánh dấu đã đọc
                          </Button>
                        )}
                      </p>
                    )}
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
        {history.hasNextPage && (
          <Button
            variant="secondary"
            loading={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            Tải thêm thông báo
          </Button>
        )}
      </Panel>
    </>
  );
}

export default function ApiNotifications() {
  const { session } = useAuth();
  return (
    <NotificationComposer
      key={`${session?.mode}:${session?.user.id}:${session?.user.roleName}`}
    />
  );
}

function NotificationComposer() {
  const { session } = useAuth();
  const client = useQueryClient();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const current = () => {
    const now = getSession();
    return (
      active.current &&
      now?.mode === "api" &&
      now.user.id === session?.user.id &&
      now.token === session?.token
    );
  };
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
  const sendInFlight = useRef(false);
  const [lastSend, setLastSend] = useState<NotificationSendResult | null>(null);

  const classTarget =
    audience === "class" && target ? Number(target) : undefined;
  const classRoster = useQuery({
    queryKey: [
      "notification-class-roster",
      session?.user.id,
      session?.user.roleName,
      classTarget,
    ],
    queryFn: () => operations.students(classTarget!),
    enabled: session?.mode === "api" && classTarget !== undefined,
    retry: false,
  });
  const role = session?.user.roleName;
  const availableClasses = (classes.data || []).filter(
    (item) => role !== "COACH" || item.coachId === session?.user.id,
  );
  const memberOptions =
    role === "COACH"
      ? students.data
      : (users.data || [])
          .filter(
            (user) => user.roleName === "MEMBER" && user.status === "ACTIVE",
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
      : memberOptions.filter((student) => student.memberId === Number(target));
  const activeClass = availableClasses.find((item) => item.id === classTarget);
  const canSend = role === "CENTER_MANAGER" || role === "COACH";
  const coaches = (users.data || []).filter(
    (user) => user.roleName === "COACH" && user.status === "ACTIVE",
  );
  const formLoading =
    audience === "class"
      ? classes.isPending ||
        (classTarget !== undefined && classRoster.isPending)
      : role === "COACH"
        ? students.isPending
        : users.isPending;
  const formError =
    audience === "class"
      ? classTarget !== undefined && classRoster.error
      : role === "COACH"
        ? students.error
        : users.error;
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
    if (!draft || sendInFlight.current) return;
    sendInFlight.current = true;
    setSending(true);
    try {
      if (draft.audience === "class") {
        const fresh = await operations.students(draft.targetId);
        if (!current()) return;
        const booked = new Set(
          fresh
            .filter((student) => student.bookingStatus === "BOOKED")
            .map((student) => student.memberId),
        );
        if (!draft.recipientIds.every((id) => booked.has(id)))
          throw new Error(
            "Danh sách học viên đã thay đổi. Hãy chọn lại người nhận.",
          );
      }
      if (!current()) return;
      const result = await notificationsApi.send({
        recipientIds: draft.recipientIds,
        title: draft.title,
        content: draft.content,
        kind: draft.kind,
        ...(draft.coachId ? { coachId: draft.coachId } : {}),
      });
      if (!current()) return;
      if (result.workoutPlanIds.length)
        await client.invalidateQueries({ queryKey: ["workout-plans"] });
      if (!current()) return;
      setLastSend(result);
      setDraft(null);
      setReview(false);
      toast(
        `Backend đã chấp nhận gửi tới ${result.acceptedRecipients} học viên; ${result.onlineRecipientsAtSend} học viên có kết nối trực tuyến.`,
      );
    } catch (error) {
      if (current()) toast(errorText(error), "error");
    } finally {
      sendInFlight.current = false;
      setSending(false);
    }
  }

  const createDraft = (data: FormData) => {
    const title = String(data.get("title") || "").trim();
    const content = String(data.get("content") || "").trim();
    if (!title || title.length > 150 || !content || content.length > 4000)
      throw new Error("Tiêu đề và nội dung bắt buộc, tối đa 150/4.000 ký tự.");
    const selectedTarget = Number(data.get("target"));
    const selectedClass =
      audience === "class"
        ? availableClasses.find((item) => item.id === selectedTarget)
        : undefined;
    const recipients =
      audience === "class"
        ? (classRoster.data || []).filter(
            (student) =>
              student.bookingStatus === "BOOKED" && student.memberId > 0,
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
      recipientIds: [...new Set(recipients.map((student) => student.memberId))],
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
          ) : audience === "class" &&
            classTarget !== undefined &&
            classRoster.error ? (
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
                <option value="">
                  Chọn {audience === "class" ? "lớp" : "học viên"}
                </option>
                {audience === "class"
                  ? availableClasses
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
            <Notice>
              Bài tập sẽ được lưu vào giáo án dưới tài khoản của bạn.
            </Notice>
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
              Chưa tải được danh sách người nhận; hãy tải lại trước khi xem
              trước.
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
            GENERAL được lưu để học viên xem lại; người đang online nhận thêm
            qua SSE. HOMEWORK vẫn được lưu thành kế hoạch tập luyện.
          </Notice>
          <div className="modal-footer">
            <Button
              variant="secondary"
              disabled={sending}
              onClick={() => {
                setReview(false);
                setTarget(String(draft.targetId));
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

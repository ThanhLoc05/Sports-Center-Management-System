import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCatalog } from "../lib/catalog";
import { dateLabel, timeLabel } from "../lib/utils";
import {
  Avatar,
  Button,
  Empty,
  ErrorState,
  Field,
  FormModal,
  Loading,
  Modal,
  Panel,
  useToast,
} from "./ui";

export function CoachProfileDialog({
  coachId,
  onClose,
}: {
  coachId: number;
  onClose: () => void;
}) {
  const { sports } = useCatalog();
  const profile = useQuery({
    queryKey: ["coach-profile", coachId],
    queryFn: () => api.coachProfile(coachId),
    retry: false,
  });
  const classes = useQuery({
    queryKey: ["coach-profile-classes", coachId],
    queryFn: () => api.classes(coachId),
    retry: false,
  });
  const activeClasses = (classes.data || []).filter(
    (item) => item.status === "SCHEDULED",
  );
  return (
    <Modal
      className="content-preview-dialog profile-preview-dialog"
      title="Thông tin huấn luyện viên"
      onClose={onClose}
      wide
    >
      <div className="coach-profile-dialog-content">
        {profile.isPending ? (
          <Loading />
        ) : profile.error ? (
          <ErrorState error={profile.error} retry={profile.refetch} />
        ) : (
          <>
            <div className="member-detail-header">
              <Avatar name={profile.data.fullName} size="large" />
              <div>
                <h2>{profile.data.fullName}</h2>
                <p>{profile.data.professionalLevel || "Chưa cập nhật trình độ"}</p>
              </div>
            </div>
            <div className="detail-grid">
              <div>
                <span>Chuyên môn</span>
                <strong>{profile.data.specialties || "Chưa cập nhật"}</strong>
              </div>
              <div>
                <span>Giới thiệu</span>
                <strong>{profile.data.bio || "Chưa cập nhật"}</strong>
              </div>
            </div>
          </>
        )}
        <h3>Lớp đang phụ trách</h3>
        {classes.isPending ? (
          <Loading />
        ) : classes.error ? (
          <ErrorState error={classes.error} retry={classes.refetch} />
        ) : activeClasses.length ? (
          <div className="roster-list">
            {activeClasses.map((item) => (
              <div key={item.id}>
                <strong>{item.className}</strong>
                <span>
                  {(sports[item.sportId] || `Bộ môn #${item.sportId}`) +
                    " · " +
                    dateLabel(item.scheduleTime) +
                    " · " +
                    timeLabel(item.scheduleTime)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="Chưa có lớp đang mở"
            description="Lịch lớp đang phụ trách sẽ hiển thị tại đây."
          />
        )}
      </div>
    </Modal>
  );
}

export function CoachProfileCard({ coachId }: { coachId: number }) {
  const { session } = useAuth();
  const client = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const profile = useQuery({
    queryKey: ["coach-profile", coachId],
    queryFn: () => api.coachProfile(coachId),
    enabled: session?.mode === "api",
    retry: false,
  });
  return (
    <>
      <Panel
        className="panel-spaced"
        title="Hồ sơ nghề nghiệp"
        action={
          session?.mode === "api" ? (
            <Button
              variant="secondary"
              disabled={!profile.isSuccess || profile.isFetching}
              onClick={() => setEditing(true)}
            >
              Cập nhật hồ sơ nghề nghiệp
            </Button>
          ) : undefined
        }
      >
        {profile.isPending ? (
          <Loading />
        ) : profile.error ? (
          <ErrorState error={profile.error} retry={profile.refetch} />
        ) : (
          <div className="detail-grid">
            <div>
              <span>Trình độ</span>
              <strong>{profile.data.professionalLevel || "Chưa cập nhật"}</strong>
            </div>
            <div>
              <span>Chuyên môn</span>
              <strong>{profile.data.specialties || "Chưa cập nhật"}</strong>
            </div>
            <div>
              <span>Giới thiệu</span>
              <strong>{profile.data.bio || "Chưa cập nhật"}</strong>
            </div>
          </div>
        )}
      </Panel>
      {editing && profile.data && (
        <FormModal
          title="Cập nhật hồ sơ nghề nghiệp"
          onClose={() => setEditing(false)}
          onSubmit={async (data) => {
            const saved = await api.saveCoachProfile(coachId, {
              professionalLevel:
                String(data.get("professionalLevel")).trim() || null,
              specialties: String(data.get("specialties")).trim() || null,
              bio: String(data.get("bio")).trim() || null,
            });
            client.setQueryData(["coach-profile", coachId], saved);
            toast("Đã cập nhật hồ sơ nghề nghiệp.");
          }}
        >
          <Field label="Trình độ">
            <input
              name="professionalLevel"
              maxLength={100}
              defaultValue={profile.data.professionalLevel || ""}
            />
          </Field>
          <Field label="Chuyên môn">
            <input
              name="specialties"
              maxLength={500}
              defaultValue={profile.data.specialties || ""}
            />
          </Field>
          <Field label="Giới thiệu">
            <textarea
              name="bio"
              maxLength={4000}
              defaultValue={profile.data.bio || ""}
            />
          </Field>
        </FormModal>
      )}
    </>
  );
}

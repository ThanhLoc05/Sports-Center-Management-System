import { PendingEditor } from "./PendingEditor";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { operations } from "../lib/operations-api";
import {
  Button,
  DataTable,
  ErrorState,
  Field,
  FormModal,
  Loading,
  Notice,
  PageHeader,
  Panel,
  useToast,
} from "./ui";
/**
 * Hai tab dùng chung bố cục nhưng tải riêng danh sách phòng tập và bộ môn.
 * Form tạo gọi API thật; chỉnh sửa dùng PendingEditor trong lúc chờ API sửa.
 * Chỉ thông báo thành công và tải lại danh sách sau khi backend chấp nhận.
 */
export default function ApiFacilities() {
  const [tab, setTab] = useState<"rooms" | "sports">("rooms");
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<{
    name: string;
    capacity?: number;
    description?: string;
  } | null>(null);
  const client = useQueryClient();
  const toast = useToast();
  const rooms = useQuery({ queryKey: ["rooms"], queryFn: api.rooms });
  const sports = useQuery({ queryKey: ["sports"], queryFn: api.sports });
  const q = tab === "rooms" ? rooms : sports;
  return (
    <>
      <PageHeader
        title="Bộ môn & phòng tập"
        actions={
          <Button onClick={() => setCreate(true)}>
            {tab === "rooms" ? "Thêm phòng tập" : "Thêm bộ môn"}
          </Button>
        }
      />
      <div className="page-actions">
        <Button variant="secondary" onClick={() => setTab("rooms")}>
          Phòng tập
        </Button>
        <Button variant="secondary" onClick={() => setTab("sports")}>
          Bộ môn
        </Button>
      </div>
      <Panel>
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} retry={q.refetch} />
        ) : tab === "rooms" ? (
          <DataTable
            rows={rooms.data || []}
            columns={[
              { key: "name", label: "Phòng tập", render: (r) => r.name },
              { key: "capacity", label: "Sức chứa", render: (r) => r.capacity },
              {
                key: "action",
                label: "Thao tác",
                render: (r) => (
                  <Button variant="ghost" onClick={() => setEdit(r)}>
                    Chỉnh sửa phòng
                  </Button>
                ),
              },
            ]}
          />
        ) : (
          <DataTable
            rows={sports.data || []}
            columns={[
              { key: "name", label: "Bộ môn", render: (s) => s.name },
              {
                key: "description",
                label: "Mô tả",
                render: (s) => s.description,
              },
              {
                key: "action",
                label: "Thao tác",
                render: (s) => (
                  <Button variant="ghost" onClick={() => setEdit(s)}>
                    Chỉnh sửa bộ môn
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Panel>
      <Notice>
        Có thể thêm và xem danh mục. Backend chưa có API sửa/xóa phòng hoặc bộ
        môn; giao diện không thực hiện thay đổi đó.
      </Notice>
      {edit && (
        <PendingEditor
          title={tab === "rooms" ? "Chỉnh sửa phòng tập" : "Chỉnh sửa bộ môn"}
          onClose={() => setEdit(null)}
          fields={[
            {
              name: "name",
              label: tab === "rooms" ? "Tên phòng" : "Tên bộ môn",
              value: edit.name,
            },
            ...(tab === "rooms"
              ? [
                  {
                    name: "capacity",
                    label: "Sức chứa",
                    type: "number" as const,
                    value: edit.capacity || 1,
                  },
                ]
              : [
                  {
                    name: "description",
                    label: "Mô tả",
                    type: "textarea" as const,
                    value: edit.description || "",
                  },
                ]),
          ]}
        />
      )}
      {create && (
        <FormModal
          title={tab === "rooms" ? "Thêm phòng tập" : "Thêm bộ môn"}
          onClose={() => setCreate(false)}
          onSubmit={async (d) => {
            if (tab === "rooms")
              await operations.createRoom(
                String(d.get("name")),
                Number(d.get("capacity")),
              );
            else
              await operations.createSport(
                String(d.get("name")),
                String(d.get("description")),
              );
            await client.invalidateQueries({ queryKey: [tab] });
            toast("Đã lưu danh mục vào hệ thống.");
          }}
        >
          <Field label={tab === "rooms" ? "Tên phòng" : "Tên bộ môn"}>
            <input name="name" required maxLength={150} />
          </Field>
          {tab === "rooms" ? (
            <Field label="Sức chứa">
              <input name="capacity" type="number" min={1} step={1} required />
            </Field>
          ) : (
            <Field label="Mô tả">
              <textarea name="description" maxLength={2000} />
            </Field>
          )}
        </FormModal>
      )}
    </>
  );
}

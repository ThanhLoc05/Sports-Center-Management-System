import ApiFacilities from "../components/ApiFacilities";
/**
 * Phiên API dùng ApiFacilities để tải/tạo bộ môn và phòng tập qua backend.
 * Chỉnh sửa chưa có API chỉ cho xem lại; LegacyFacilities phục vụ kiểm thử demo.
 */
import { useState } from "react";
import { Dumbbell, DoorOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { readDemo } from "../lib/demo";
import { updateDemo } from "../lib/api";
import type { FacilityRoom, Sport } from "../lib/types";
import {
  Button,
  Confirm,
  DataTable,
  DemoOnly,
  Field,
  FormModal,
  PageHeader,
  Panel,
  useToast,
} from "../components/ui";
export default function Facilities() {
  const { session } = useAuth();
  return session?.mode === "api" ? <ApiFacilities /> : <LegacyFacilities />;
}
function LegacyFacilities() {
  const { session } = useAuth();
  const demo = session!.mode === "demo";
  const [tab, setTab] = useState<"rooms" | "sports">("rooms");
  const [edit, setEdit] = useState<FacilityRoom | Sport | true | null>(null);
  const [remove, setRemove] = useState<FacilityRoom | Sport | null>(null);
  const client = useQueryClient();
  const toast = useToast();
  const db = demo ? readDemo() : null;
  /**
   * Tab rooms/sports chọn mảng demo cần hiển thị; API mode không tạo danh sách giả
   * cho danh mục backend chưa có endpoint.
   */
  const rows = tab === "rooms" ? db?.rooms || [] : db?.sports || [];
  return (
    <>
      <PageHeader
        eyebrow="SPACE TO DO MORE"
        title="Bộ môn & phòng tập"
        description="Sắp xếp không gian cho những chuyển động chất lượng."
        actions={
          <Button disabled={!demo} onClick={() => setEdit(true)}>
            <Plus size={17} />
            {tab === "rooms" ? "Thêm phòng tập demo" : "Thêm bộ môn demo"}
          </Button>
        }
      />
      <DemoOnly>
        {demo
          ? "Danh mục phòng và bộ môn đang lưu demo local, được dùng trong form tạo lớp và kiểm tra sức chứa. Backend có entity/repository nhưng chưa có controller quản lý."
          : undefined}
      </DemoOnly>
      <div className="facility-tabs">
        <div className="segmented">
          <button
            className={tab === "rooms" ? "active" : ""}
            onClick={() => setTab("rooms")}
          >
            <DoorOpen size={15} />
            Phòng tập
          </button>
          <button
            className={tab === "sports" ? "active" : ""}
            onClick={() => setTab("sports")}
          >
            <Dumbbell size={15} />
            Bộ môn
          </button>
        </div>
      </div>
      <Panel
        title={tab === "rooms" ? "Không gian tập luyện" : "Danh mục bộ môn"}
        description="Danh mục minh họa, tách biệt dữ liệu máy chủ."
      >
        <DataTable
          rows={rows}
          columns={[
            {
              key: "name",
              label: tab === "rooms" ? "Phòng tập" : "Bộ môn",
              render: (r) => <strong>{r.name}</strong>,
            },
            {
              key: "id",
              label: "ID danh mục",
              render: (r) => <span className="mono">#{r.id}</span>,
            },
            {
              key: "description",
              label: "Mô tả",
              render: (r) => r.description,
            },
            {
              key: "usage",
              label: tab === "rooms" ? "Sức chứa" : "Lớp học",
              render: (r) =>
                tab === "rooms"
                  ? `${"capacity" in r ? r.capacity : 0} người`
                  : `${db?.classes.filter((c) => c.sportId === r.id).length || 0} lớp`,
            },
            {
              key: "actions",
              label: "Thao tác",
              render: (r) => (
                <div className="row-actions">
                  <button className="subtle-link" onClick={() => setEdit(r)}>
                    <Pencil size={14} />
                    Sửa
                  </button>
                  <button className="text-danger" onClick={() => setRemove(r)}>
                    <Trash2 size={14} />
                    Xóa
                  </button>
                </div>
              ),
            },
          ]}
        />
      </Panel>
      {edit && demo && (
        <FormModal
          title={
            edit === true
              ? `Thêm ${tab === "rooms" ? "phòng tập" : "bộ môn"} demo`
              : "Chỉnh sửa danh mục demo"
          }
          onClose={() => setEdit(null)}
          onSubmit={async (d) => {
            const name = String(d.get("name")).trim(),
              description = String(d.get("description"));
            updateDemo("Cập nhật danh mục demo", name, (db) => {
              const list = tab === "rooms" ? db.rooms : db.sports;
              const id =
                edit === true
                  ? Math.max(0, ...list.map((r) => r.id)) + 1
                  : edit.id;
              if (
                list.some(
                  (r) =>
                    r.id !== id && r.name.toLowerCase() === name.toLowerCase(),
                )
              )
                throw new Error("Tên danh mục đã tồn tại.");
              if (tab === "rooms") {
                const capacity = Number(d.get("capacity"));
                if (
                  db.classes.some(
                    (c) =>
                      c.roomId === id &&
                      c.status !== "CANCELLED" &&
                      c.maxCapacity > capacity,
                  )
                )
                  throw new Error(
                    "Sức chứa mới nhỏ hơn sức chứa lớp đang dùng phòng.",
                  );
                const item = { id, name, description, capacity };
                if (edit === true) db.rooms.push(item);
                else db.rooms = db.rooms.map((r) => (r.id === id ? item : r));
              } else {
                const item = { id, name, description };
                if (edit === true) db.sports.push(item);
                else db.sports = db.sports.map((r) => (r.id === id ? item : r));
              }
            });
            await client.invalidateQueries();
            toast("Đã lưu danh mục demo.");
          }}
        >
          <Field label="Tên danh mục">
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              defaultValue={edit === true ? "" : edit.name}
            />
          </Field>
          <Field label="Mô tả">
            <textarea
              name="description"
              maxLength={1000}
              rows={3}
              defaultValue={edit === true ? "" : edit.description}
            />
          </Field>
          {tab === "rooms" && (
            <Field label="Sức chứa (người)">
              <input
                name="capacity"
                type="number"
                min="1"
                max="500"
                required
                defaultValue={
                  edit !== true && "capacity" in edit ? edit.capacity : 20
                }
              />
            </Field>
          )}
        </FormModal>
      )}
      {remove && (
        <Confirm
          title="Xóa danh mục demo?"
          description={`Xóa ${remove.name} khỏi danh mục. Chỉ có thể xóa khi không còn lớp học tham chiếu.`}
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            updateDemo("Xóa danh mục demo", remove.name, (db) => {
              if (
                db.classes.some((c) =>
                  tab === "rooms"
                    ? c.roomId === remove.id
                    : c.sportId === remove.id,
                )
              )
                throw new Error(
                  "Danh mục đang được lớp học tham chiếu, chưa thể xóa.",
                );
              if (tab === "rooms")
                db.rooms = db.rooms.filter((r) => r.id !== remove.id);
              else db.sports = db.sports.filter((s) => s.id !== remove.id);
            });
            await client.invalidateQueries();
            toast("Đã xóa danh mục demo.");
          }}
        />
      )}
    </>
  );
}

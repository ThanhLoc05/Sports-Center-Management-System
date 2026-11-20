import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Button, Field } from "./ui";

const genericTemplate =
  "Mục tiêu: [Kỹ thuật hoặc kỹ năng cần luyện]\nBài tập: [Cách thực hiện và khối lượng phù hợp]\nKết quả cần ghi: [Chỉ số hoặc nhận xét]";

const templates: Record<string, string> = {
  "cầu lông":
    "Cầu lông · Giao cầu vào ô mục tiêu\nLuyện giao cầu 20 lần. Ghi số lần trúng ô trên 20 lần thử.",
  "bóng rổ":
    "Bóng rổ · Ném rổ tại một vị trí\nThực hiện 20 cú ném từ cùng một vị trí. Ghi số quả vào rổ trên 20 lần thử.",
  "bơi lội":
    "Bơi lội · Bơi 50 m\nGhi thời gian hoàn thành 50 m và nhận xét về nhịp thở.",
  yoga: "Yoga · Giữ tư thế thăng bằng\nGhi số giây giữ được tư thế và nhận xét về độ ổn định.",
  fitness: "Fitness · Squat\nGhi số hiệp, số lần mỗi hiệp và mức tạ phù hợp.",
  boxing:
    "Boxing · Luyện kỹ thuật với bao tập\nGhi số hiệp hoàn thành và nhận xét về nhịp di chuyển.",
  pilates:
    "Pilates · Luyện kiểm soát chuyển động\nGhi số lần thực hiện và nhận xét về tư thế.",
};

/** Mẫu chỉ hỗ trợ soạn nội dung. Quyền và đối tượng nhận do form cha quyết định. */
export function TrainingInstructions({
  label,
  name,
  initialValue = "",
  minLength,
  maxLength,
  rows,
  showTemplates = true,
  forClass,
  classSportId,
}: {
  label: string;
  name: string;
  initialValue?: string;
  minLength: number;
  maxLength?: number;
  rows: number;
  showTemplates?: boolean;
  forClass: boolean;
  classSportId?: number;
}) {
  const [content, setContent] = useState(initialValue);
  const [personalSport, setPersonalSport] = useState("");
  const sports = useQuery({
    queryKey: ["sports"],
    queryFn: api.sports,
    enabled: showTemplates && (!forClass || classSportId != null),
  });
  const sportId = forClass ? classSportId : Number(personalSport);
  const sport = sports.data?.find((item) => item.id === sportId);
  const sportKey = sport?.name.trim().toLowerCase() ?? "";
  const template = Object.hasOwn(templates, sportKey)
    ? templates[sportKey]
    : genericTemplate;
  const withTemplate = template
    ? [content, template].filter(Boolean).join("\n\n")
    : content;

  return (
    <>
      {showTemplates && !forClass && (
        <Field label="Bộ môn để gợi ý bài tập">
          <select
            value={personalSport}
            onChange={(event) => setPersonalSport(event.target.value)}
          >
            <option value="">Chọn bộ môn (không bắt buộc)</option>
            {sports.data?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {showTemplates && sport && (
        <Button
          type="button"
          variant="secondary"
          disabled={
            content.includes(template) ||
            (maxLength != null && withTemplate.length > maxLength)
          }
          onClick={() => setContent(withTemplate)}
        >
          Chèn mẫu {sport.name}
        </Button>
      )}
      <Field label={label}>
        <textarea
          name={name}
          required
          minLength={minLength}
          maxLength={maxLength}
          rows={rows}
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      </Field>
    </>
  );
}

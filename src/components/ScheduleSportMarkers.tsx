const markerBySport: Record<string, { code: string; tone: string }> = {
  "cầu lông": { code: "CL", tone: "badminton" },
  yoga: { code: "YG", tone: "yoga" },
  dance: { code: "DC", tone: "dance" },
};

/**
 * Cái gì: tông màu chung của một ô lịch (badminton / yoga / dance).
 * Làm sao: mọi buổi trong ô cùng một bộ môn thì trả tông đó; ô trống hoặc nhiều môn khác nhau trả undefined.
 * Tại sao: ô lịch tô cùng màu với chú thích bên dưới để nhìn là biết môn; ô nhiều môn giữ màu trung tính.
 */
export function sportTone(names: string[]): string | undefined {
  const tones = new Set(names.map((name) => markerBySport[name.toLocaleLowerCase("vi")]?.tone));
  return tones.size === 1 ? [...tones][0] : undefined;
}

export default function ScheduleSportMarkers({ names }: { names: string[] }) {
  const uniqueNames = [...new Set(names)];
  if (!uniqueNames.length) return null;
  return (
    <span className="manager-week-sport-markers" title={uniqueNames.join(", ")} aria-label={uniqueNames.join(", ")}>
      {uniqueNames.map((name) => {
        const marker = markerBySport[name.toLocaleLowerCase("vi")];
        return (
          <span key={name} data-sport={marker?.tone} aria-hidden="true">
            {marker?.code ?? name.slice(0, 2).toLocaleUpperCase("vi")}
          </span>
        );
      })}
    </span>
  );
}

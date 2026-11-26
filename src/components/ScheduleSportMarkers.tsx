const markerBySport: Record<string, { code: string; tone: string }> = {
  "cầu lông": { code: "CL", tone: "badminton" },
  yoga: { code: "YG", tone: "yoga" },
  dance: { code: "DC", tone: "dance" },
};

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

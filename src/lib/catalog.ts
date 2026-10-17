import { readDemo } from "./demo";
import { useAuth } from "./auth";
export function useCatalog() {
  const { session } = useAuth();
  const db = session?.mode === "demo" ? readDemo() : null;
  return {
    sports: Object.fromEntries(
      db?.sports.map((s) => [s.id, s.name]) || [],
    ) as Record<number, string>,
    rooms: Object.fromEntries(
      db?.rooms.map((r) => [r.id, r.name]) || [],
    ) as Record<number, string>,
  };
}

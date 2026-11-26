/** Match explicit sport names in coach specialties and room labels, as in flexible scheduling validation. */
function sportWords(text?: string | null) {
  return " " + (text ?? "").normalize("NFD").replace(/\p{M}+/gu, "")
    .toLowerCase().replaceAll("đ", "d").replace(/[^a-z0-9]+/g, " ").trim() + " ";
}

export function matchesSchedulingSport(
  description: string | null | undefined,
  sportId: number,
  sports: Record<number, string>,
) {
  const words = sportWords(description);
  const identified = Object.entries(sports).filter(([, name]) => {
    const key = sportWords(name);
    return (key !== "  " && words.includes(key))
      || (key === " cau long " && words.includes(" badminton "))
      || (key === " badminton " && words.includes(" cau long "))
      || (key === " dance " && words.includes(" hip hop "));
  });
  return !identified.length || identified.some(([id]) => Number(id) === sportId);
}

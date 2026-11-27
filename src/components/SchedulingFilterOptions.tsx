export type SchedulingFilterResource = { id: string; name: string; sportIds: number[] };

function includesSport(resource: SchedulingFilterResource, sport: string) {
  return sport === "all" || resource.sportIds.includes(Number(sport));
}

export function compatibleResourceSelection(resources: SchedulingFilterResource[], id: string, sport: string) {
  return sport === "all" || resources.some(resource => resource.id === id && includesSport(resource, sport)) ? id : "";
}

export function SchedulingFilterOptions({ resources, sport, sports }: {
  resources: SchedulingFilterResource[];
  sport: string;
  sports: Record<number, string>;
}) {
  const option = ({ id, name }: SchedulingFilterResource) => <option key={id} value={id}>{name}</option>;
  if (sport !== "all") return resources.filter(resource => includesSport(resource, sport)).map(option);

  const unclassified = resources.filter(resource => !resource.sportIds.some(id => id in sports));
  return <>
    {Object.entries(sports).map(([id, name]) => {
      const group = resources.filter(resource => includesSport(resource, id));
      return group.length > 0 && <optgroup key={id} label={name}>{group.map(option)}</optgroup>;
    })}
    {unclassified.length > 0 && <optgroup label="Chưa phân loại">{unclassified.map(option)}</optgroup>}
  </>;
}

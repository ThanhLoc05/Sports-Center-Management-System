import { useQuery } from "@tanstack/react-query";
import { api, mode } from "./api";

export function useCourseFeature() {
  const demo = mode() === "demo";
  const query = useQuery({
    queryKey: ["features"],
    queryFn: api.features,
    enabled: !demo,
    retry: false,
    staleTime: 60_000,
  });
  return {
    enabled: demo || (query.isSuccess && query.data?.courseEnabled === true),
    pending: !demo && query.isPending,
  };
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth";
import { isManager } from "./types";
import { useToast } from "../components/ui";
import { errorText } from "./utils";
export function useUsers() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["users"],
    queryFn: api.users,
    enabled:
      !!session &&
      (session.mode === "demo" || isManager(session.user.roleName)),
  });
}
export function useClasses() {
  const { session } = useAuth();
  const coachId =
    session?.user.roleName === "COACH" ? session.user.id : undefined;
  return useQuery({
    queryKey: ["classes", coachId],
    queryFn: () => api.classes(coachId),
    enabled: !!session,
  });
}
export function useAction<T>(
  fn: (value: T) => Promise<unknown> | unknown,
  success = "Đã lưu thay đổi.",
) {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async (value: T) => fn(value),
    onSuccess: () => {
      void client.invalidateQueries();
      toast(success);
    },
    onError: (e) => toast(errorText(e), "error"),
  });
}

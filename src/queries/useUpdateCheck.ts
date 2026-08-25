import { useMutation } from "@tanstack/react-query";
import { e621Api } from "../api/client";

export function useUpdateCheck() {
  return useMutation({
    mutationFn: () => e621Api.checkForUpdate(),
  });
}

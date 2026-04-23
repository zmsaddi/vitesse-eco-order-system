"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  fetchNotifications,
  fetchPreferences,
  markAllRead as markAllApi,
  markOneRead as markOneApi,
  updatePreferences as updatePrefsApi,
  type ListQuery,
} from "@/lib/notifications-client";
import type {
  ListNotificationsResponse,
  NotificationDto,
  NotificationPreferenceDto,
} from "@/modules/notifications/dto";

// Phase 5.1b — TanStack Query wrappers for the notifications endpoints.
// The global fetch interceptor (useUnreadCount.ts) keeps the badge in sync
// with every response, so these hooks do not read or write the header store
// directly.

export function useNotificationsQuery(
  query: ListQuery,
  options: { enabled?: boolean; initialData?: ListNotificationsResponse } = {},
): UseQueryResult<ListNotificationsResponse> {
  return useQuery({
    queryKey: ["notifications", query],
    queryFn: () => fetchNotifications(query),
    enabled: options.enabled ?? true,
    staleTime: 10_000, // D-42: dropdown uses staleTime 10s
    initialData: options.initialData,
  });
}

export function usePreferencesQuery(
  options: { initialData?: NotificationPreferenceDto[] } = {},
): UseQueryResult<NotificationPreferenceDto[]> {
  return useQuery({
    queryKey: ["notification-preferences"],
    queryFn: fetchPreferences,
    staleTime: 60_000,
    initialData: options.initialData,
  });
}

export function useMarkOneRead() {
  const qc = useQueryClient();
  return useMutation<NotificationDto, Error, number>({
    mutationFn: (id) => markOneApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation<{ updatedCount: number }, Error, void>({
    mutationFn: () => markAllApi(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation<
    NotificationPreferenceDto[],
    Error,
    Array<{ notificationType: string; enabled: boolean }>
  >({
    mutationFn: (updates) => updatePrefsApi(updates),
    onSuccess: (data) => {
      qc.setQueryData(["notification-preferences"], data);
    },
  });
}

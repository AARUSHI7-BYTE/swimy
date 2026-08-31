import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { subscribeAuthUser } from "../firebaseconfig";
import {
  checkIn,
  checkOut,
  Entry,
  EntryPerson,
  getOpenEntry,
  listEntriesByUser,
  listEntriesInRange,
  listTodayEntries,
  subscribeToLatestEntry,
} from "./entries";
import {
  addPool,
  deletePool,
  ensureUserDocument,
  getAllPools,
  getPoolById,
  getPoolsByIds,
  getUserById,
  getUserByPhone,
  NewPool,
  PoolProfileUpdate,
  PricingUpdate,
  saveUserProfile,
  updatePoolCapacity,
  updatePoolImageUrl,
  updatePoolPricing,
  updatePoolProfile,
  updateUserPhoto,
} from "./firestore";
import {
  addMembership,
  editMembership,
  listMembershipsByPhone,
  listMembershipsByPool,
  Membership,
  MembershipActor,
  MembershipEdit,
  NewMembership,
  pauseMembership,
  recordMembershipVisit,
  resumeMembership,
  setMembershipStatus,
  MembershipStatus,
} from "./memberships";
import { listMembershipAuditLog, logMembershipEdit, MembershipAuditType } from "./membershipAuditLog";
import { addTier, listTiers, MembershipTier, NewMembershipTier, setTierArchived, TierUpdate, updateTier } from "./membershipTiers";
import { PricingConfig } from "./pricing";
import { queryKeys } from "./queryKeys";
import { addRule, deleteRule, listRules, NewRestrictedRule } from "./restrictedTimings";

// True once the native Firebase Auth session is confirmed attached. Guards
// queries whose Firestore rules require request.auth != null against firing
// on cold start/app-resume before that session (re)attaches - see
// subscribeAuthUser.
// Exported so callers doing a manual .refetch() (e.g. useFocusEffect) can
// gate on the same condition that decides whether a query's queryFn is
// skipToken - refetch() bypasses skipToken's automatic-fetch guard and
// throws "Attempted to invoke queryFn when set to skipToken" if called while
// still disabled, so the caller's guard must match this exactly.
export function useAuthReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => subscribeAuthUser((uid) => setReady(!!uid)), []);
  return ready;
}

// ---------- Pools ----------

export function usePoolsQuery() {
  return useQuery({ queryKey: queryKeys.pools.all, queryFn: getAllPools });
}

export function usePoolQuery(poolId: string | null | undefined) {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: queryKeys.pools.byId(poolId ?? ""),
    // skipToken (not just `enabled`) because queryKeys.pools.all (["pools"]) is
    // a prefix of this key - invalidateQueries(pools.all) from add/delete/update
    // pool mutations would otherwise force-fetch this even when disabled.
    queryFn: poolId && authReady ? () => getPoolById(poolId) : skipToken,
  });
}

export function usePoolsByIdsQuery(poolIds: string[]) {
  return useQuery({
    queryKey: queryKeys.pools.byIds(poolIds),
    queryFn: poolIds.length > 0 ? () => getPoolsByIds(poolIds) : skipToken,
  });
}

export function useAddPoolMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pool: NewPool) => addPool(pool),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.pools.all }),
  });
}

export function useDeletePoolMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (poolId: string) => deletePool(poolId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.pools.all }),
  });
}

export function useUpdatePoolImageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ poolId, imageUrl }: { poolId: string; imageUrl: string }) => updatePoolImageUrl(poolId, imageUrl),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.pools.all }),
  });
}

export function useUpdatePoolPricingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ poolId, update }: { poolId: string; update: PricingUpdate }) => updatePoolPricing(poolId, update),
    onSuccess: (_data, { poolId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pools.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.pools.byId(poolId) });
    },
  });
}

export function useUpdatePoolCapacityMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ poolId, maxOccupancy }: { poolId: string; maxOccupancy: number | null }) => updatePoolCapacity(poolId, maxOccupancy),
    onSuccess: (_data, { poolId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pools.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.pools.byId(poolId) });
    },
  });
}

export function useUpdatePoolProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ poolId, update }: { poolId: string; update: PoolProfileUpdate }) => updatePoolProfile(poolId, update),
    onSuccess: (_data, { poolId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pools.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.pools.byId(poolId) });
    },
  });
}

// ---------- Users ----------

export function useUserByIdQuery(uid: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.users.byId(uid ?? ""),
    queryFn: () => getUserById(uid as string),
    enabled: !!uid,
  });
}

export function useUserByPhoneQuery(phone: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.users.byPhone(phone ?? ""),
    queryFn: () => getUserByPhone(phone as string),
    enabled: !!phone,
  });
}

export function useEnsureUserDocumentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ uid, phoneNumber }: { uid: string; phoneNumber: string }) => ensureUserDocument(uid, phoneNumber),
    onSuccess: (_data, { uid }) => queryClient.invalidateQueries({ queryKey: queryKeys.users.byId(uid) }),
  });
}

export function useSaveUserProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ uid, profile }: { uid: string; profile: { userName: string; dateOfBirth: string; gender: string } }) =>
      saveUserProfile(uid, profile),
    onSuccess: (_data, { uid }) => queryClient.invalidateQueries({ queryKey: queryKeys.users.byId(uid) }),
  });
}

export function useUpdateUserPhotoMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ uid, photoUrl }: { uid: string; photoUrl: string }) => updateUserPhoto(uid, photoUrl),
    onSuccess: (_data, { uid }) => queryClient.invalidateQueries({ queryKey: queryKeys.users.byId(uid) }),
  });
}

// ---------- Entries ----------

export function useTodayEntriesQuery(poolId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.entries.today(poolId ?? ""),
    // skipToken (not just `enabled`) so an invalidateQueries(["entries", poolId])
    // from checkIn/checkOut can't force a fetch before poolId is resolved -
    // `enabled: false` alone doesn't block an explicit invalidate/refetch.
    queryFn: poolId ? () => listTodayEntries(poolId) : skipToken,
  });
}

export function useEntriesRangeQuery(poolId: string | null | undefined, startMs: number, endMs: number) {
  return useQuery({
    queryKey: queryKeys.entries.range(poolId ?? "", startMs, endMs),
    queryFn: poolId ? () => listEntriesInRange(poolId, startMs, endMs) : skipToken,
  });
}

export function useEntriesByUserQuery(poolId: string | null | undefined, uid: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.entries.byUser(poolId ?? "", uid ?? ""),
    queryFn: poolId && uid ? () => listEntriesByUser(poolId, uid) : skipToken,
  });
}

export function useOpenEntryQuery(poolId: string | null | undefined, uid: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.entries.open(poolId ?? "", uid ?? ""),
    queryFn: poolId && uid ? () => getOpenEntry(poolId, uid) : skipToken,
  });
}

// Firestore's onSnapshot listener keeps the query cache updated in real
// time; the queryFn only covers the very first render before the listener
// attaches.
//
// onInitialSnapshot fires once per subscription, with whatever entry was
// already sitting in Firestore the moment we (re)subscribed - e.g. an old,
// already-paid visit from a prior session. Callers use it to mark that entry
// as "already seen" so a real-time entry/exit transition (a *later*
// snapshot) is what triggers a confirmation popup, not just landing on the
// screen with stale history already in place.
export function useLatestEntryQuery(
  poolId: string | null | undefined,
  uid: string | null | undefined,
  onInitialSnapshot?: (entry: Entry | null) => void
) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.entries.latest(poolId ?? "", uid ?? "");

  useEffect(() => {
    if (!poolId || !uid) return;
    let isFirstSnapshot = true;
    const unsubscribe = subscribeToLatestEntry(poolId, uid, (entry) => {
      queryClient.setQueryData(queryKey, entry);
      if (isFirstSnapshot) {
        isFirstSnapshot = false;
        onInitialSnapshot?.(entry);
      }
    });
    return unsubscribe;
  }, [poolId, uid]);

  return useQuery<Entry | null>({
    queryKey,
    // enabled: false so React Query never dispatches its own fetch (on
    // mount, refetch, or when checkIn/checkOut invalidates ["entries",
    // poolId]) - that would race the onSnapshot listener above and could
    // stomp real data back to null. The cache is populated exclusively by
    // the listener's setQueryData calls.
    queryFn: skipToken,
    enabled: false,
    initialData: null,
  });
}

function invalidateEntryQueries(queryClient: ReturnType<typeof useQueryClient>, poolId: string, uid: string) {
  queryClient.invalidateQueries({ queryKey: ["entries", poolId] });
}

export function useCheckInMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      poolId,
      uid,
      people,
      pricingSnapshot,
      membershipId,
    }: {
      poolId: string;
      uid: string;
      people: EntryPerson[];
      pricingSnapshot: PricingConfig;
      membershipId?: string;
    }) => checkIn(poolId, uid, people, pricingSnapshot, membershipId),
    onSuccess: (_data, { poolId, uid }) => {
      invalidateEntryQueries(queryClient, poolId, uid);
      queryClient.invalidateQueries({ queryKey: queryKeys.pools.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.pools.byId(poolId) });
    },
  });
}

export function useCheckOutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ poolId, uid, price }: { poolId: string; uid: string; price: number }) => checkOut(poolId, uid, price),
    onSuccess: (_data, { poolId, uid }) => {
      invalidateEntryQueries(queryClient, poolId, uid);
      queryClient.invalidateQueries({ queryKey: queryKeys.pools.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.pools.byId(poolId) });
    },
  });
}

// ---------- Memberships ----------

export function useMembershipsByPoolQuery(poolId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.memberships.byPool(poolId ?? ""),
    // skipToken (not just `enabled`) so an invalidateQueries(["memberships", poolId])
    // from add/pause/record-visit can't force a fetch before poolId is resolved -
    // `enabled: false` alone doesn't block an explicit invalidate/refetch.
    queryFn: poolId ? () => listMembershipsByPool(poolId) : skipToken,
  });
}

export function useMembershipsByPhoneQuery(poolId: string | null | undefined, phone: string | null | undefined) {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: queryKeys.memberships.byPhone(poolId ?? "", phone ?? ""),
    queryFn: poolId && phone && authReady ? () => listMembershipsByPhone(poolId, phone) : skipToken,
  });
}

function invalidateMembershipQueries(queryClient: ReturnType<typeof useQueryClient>, poolId: string) {
  queryClient.invalidateQueries({ queryKey: ["memberships", poolId] });
}

export function useAddMembershipMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ membership, actor }: { membership: NewMembership; actor: MembershipActor }) => addMembership(membership, actor),
    onSuccess: (_data, { membership }) => invalidateMembershipQueries(queryClient, membership.poolId),
  });
}

export function useSetMembershipStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ poolId, membershipId, status }: { poolId: string; membershipId: string; status: MembershipStatus }) =>
      setMembershipStatus(poolId, membershipId, status),
    onSuccess: (_data, { poolId }) => invalidateMembershipQueries(queryClient, poolId),
  });
}

// Pause stops the tenure clock; resume pushes the end-date out by however
// long the member was paused and logs the pause/resume pair for Membership
// History. Used both from the member's own self-serve toggle and from the
// facility Member Detail screen.
export function usePauseMembershipMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ poolId, membershipId, plannedDays }: { poolId: string; membershipId: string; plannedDays?: number | null }) =>
      pauseMembership(poolId, membershipId, plannedDays ?? null),
    onSuccess: (_data, { poolId }) => invalidateMembershipQueries(queryClient, poolId),
  });
}

export function useResumeMembershipMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ poolId, membership, actor }: { poolId: string; membership: Membership; actor: MembershipActor }) =>
      resumeMembership(poolId, membership, actor),
    onSuccess: (_data, { poolId, membership }) => {
      invalidateMembershipQueries(queryClient, poolId);
      queryClient.invalidateQueries({ queryKey: ["membershipAuditLog", poolId, membership.id] });
    },
  });
}

export function useRecordMembershipVisitMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ poolId, membershipId, nextSessionsUsed }: { poolId: string; membershipId: string; nextSessionsUsed: number }) =>
      recordMembershipVisit(poolId, membershipId, nextSessionsUsed),
    onSuccess: (_data, { poolId }) => invalidateMembershipQueries(queryClient, poolId),
  });
}

// ---------- Membership tiers ----------

export function useMembershipTiersQuery(poolId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.membershipTiers.byPool(poolId ?? ""),
    queryFn: poolId ? () => listTiers(poolId) : skipToken,
  });
}

export function useAddTierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tier: NewMembershipTier) => addTier(tier),
    onSuccess: (_data, tier) => queryClient.invalidateQueries({ queryKey: queryKeys.membershipTiers.byPool(tier.poolId) }),
  });
}

export function useUpdateTierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ poolId, tierId, update }: { poolId: string; tierId: string; update: TierUpdate }) => updateTier(poolId, tierId, update),
    onSuccess: (_data, { poolId }) => queryClient.invalidateQueries({ queryKey: queryKeys.membershipTiers.byPool(poolId) }),
  });
}

export function useSetTierArchivedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ poolId, tierId, archived }: { poolId: string; tierId: string; archived: boolean }) => setTierArchived(poolId, tierId, archived),
    onSuccess: (_data, { poolId }) => queryClient.invalidateQueries({ queryKey: queryKeys.membershipTiers.byPool(poolId) }),
  });
}

// Facility-side member edit (tier switch / days adjust / tenure dates) from
// the Member Detail screen. Always paired with an audit log entry.
export function useEditMembershipMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      poolId,
      membershipId,
      edit,
      actor,
      type,
      summary,
    }: {
      poolId: string;
      membershipId: string;
      edit: MembershipEdit;
      actor: MembershipActor;
      type: MembershipAuditType;
      summary: string;
    }) => {
      await editMembership(poolId, membershipId, edit);
      await logMembershipEdit(poolId, membershipId, { ...actor, type, summary });
    },
    onSuccess: (_data, { poolId, membershipId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.memberships.byPool(poolId) });
      queryClient.invalidateQueries({ queryKey: ["membershipAuditLog", poolId, membershipId] });
    },
  });
}

export function useMembershipAuditLogQuery(poolId: string | null | undefined, membershipId: string | null | undefined) {
  return useQuery({
    queryKey: ["membershipAuditLog", poolId ?? "", membershipId ?? ""] as const,
    queryFn: poolId && membershipId ? () => listMembershipAuditLog(poolId, membershipId) : skipToken,
  });
}

export type { MembershipTier };

// ---------- Restricted timings ----------

export function useRestrictedRulesQuery(poolId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.restrictedRules.byPool(poolId ?? ""),
    queryFn: () => listRules(poolId as string),
    enabled: !!poolId,
  });
}

export function useAddRuleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ poolId, rule }: { poolId: string; rule: NewRestrictedRule }) => addRule(poolId, rule),
    onSuccess: (_data, { poolId }) => queryClient.invalidateQueries({ queryKey: queryKeys.restrictedRules.byPool(poolId) }),
  });
}

export function useDeleteRuleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ poolId, ruleId }: { poolId: string; ruleId: string }) => deleteRule(poolId, ruleId),
    onSuccess: (_data, { poolId }) => queryClient.invalidateQueries({ queryKey: queryKeys.restrictedRules.byPool(poolId) }),
  });
}

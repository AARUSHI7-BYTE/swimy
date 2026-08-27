export const queryKeys = {
  pools: {
    all: ["pools"] as const,
    byId: (poolId: string) => ["pools", poolId] as const,
    byIds: (poolIds: string[]) => ["pools", "byIds", [...poolIds].sort()] as const,
  },
  users: {
    byId: (uid: string) => ["users", uid] as const,
    byPhone: (phone: string) => ["users", "byPhone", phone] as const,
  },
  entries: {
    today: (poolId: string) => ["entries", poolId, "today"] as const,
    range: (poolId: string, startMs: number, endMs: number) => ["entries", poolId, "range", startMs, endMs] as const,
    byUser: (poolId: string, uid: string) => ["entries", poolId, "byUser", uid] as const,
    open: (poolId: string, uid: string) => ["entries", poolId, "open", uid] as const,
    latest: (poolId: string, uid: string) => ["entries", poolId, "latest", uid] as const,
  },
  memberships: {
    byPool: (poolId: string) => ["memberships", poolId] as const,
    byPhone: (poolId: string, phone: string) => ["memberships", poolId, "byPhone", phone] as const,
  },
  membershipTiers: {
    byPool: (poolId: string) => ["membershipTiers", poolId] as const,
  },
  restrictedRules: {
    byPool: (poolId: string) => ["restrictedRules", poolId] as const,
  },
};

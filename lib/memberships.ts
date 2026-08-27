import { addDoc, collection, doc, getDoc, getDocs, getFirestore, query, updateDoc, where } from "@react-native-firebase/firestore";
import { logMembershipEdit } from "./membershipAuditLog";

const db = getFirestore();

export type MembershipMember = {
  name: string;
  age: number;
  gender: string;
  canSwim: boolean;
  coaching: boolean;
  includeInMembership: boolean;
  photoUrl?: string;
};

export type MembershipStatus = "active" | "inactive";

export type Membership = {
  id: string;
  poolId: string;
  phone: string;
  isOfflineMember: boolean;
  members: MembershipMember[];
  tierId: string;
  tierName: string;
  price: number;
  durationDays: number;
  sessions: number | null; // null = unlimited
  sessionsUsed: number;
  startDate: number;
  endDate: number;
  status: MembershipStatus;
  pausedAt: number | null; // set while status is "inactive" from a pause (not a manual deactivation)
  totalPausedDays: number;
};

export type NewMembership = {
  poolId: string;
  phone: string;
  isOfflineMember: boolean;
  members: MembershipMember[];
  tierId: string;
  tierName: string;
  price: number;
  durationDays: number;
  sessions: number | null;
};

export type MembershipActor = { actorUid: string; actorRole: string };

// A membership a scanned phone number can actually use right now: active
// status, not past its validity window, and (for capped tiers) at least one
// session left. Unlimited tiers (sessions === null) are never session-capped.
export function usableMembership(memberships: Membership[]): Membership | null {
  const now = Date.now();
  return (
    memberships.find(
      (membership) =>
        membership.status === "active" &&
        membership.endDate > now &&
        (membership.sessions == null || membership.sessionsUsed < membership.sessions)
    ) ?? null
  );
}

function membershipsCollection(poolId: string) {
  return collection(db, "pools", poolId, "memberships");
}

function toMembership(id: string, poolId: string, data: Record<string, unknown>): Membership {
  return {
    id,
    poolId,
    phone: typeof data.phone === "string" ? data.phone : "",
    isOfflineMember: Boolean(data.isOfflineMember),
    members: Array.isArray(data.members) ? (data.members as MembershipMember[]) : [],
    tierId: typeof data.tierId === "string" ? data.tierId : "",
    tierName: typeof data.tierName === "string" ? data.tierName : "",
    price: typeof data.price === "number" ? data.price : 0,
    durationDays: typeof data.durationDays === "number" ? data.durationDays : 30,
    sessions: typeof data.sessions === "number" ? data.sessions : null,
    sessionsUsed: typeof data.sessionsUsed === "number" ? data.sessionsUsed : 0,
    startDate: typeof data.startDate === "number" ? data.startDate : 0,
    endDate: typeof data.endDate === "number" ? data.endDate : 0,
    status: data.status === "inactive" ? "inactive" : "active",
    pausedAt: typeof data.pausedAt === "number" ? data.pausedAt : null,
    totalPausedDays: typeof data.totalPausedDays === "number" ? data.totalPausedDays : 0,
  };
}

export async function addMembership(membership: NewMembership, actor: MembershipActor): Promise<Membership> {
  const startDate = Date.now();
  const endDate = startDate + membership.durationDays * 24 * 60 * 60 * 1000;
  const record = {
    phone: membership.phone,
    isOfflineMember: membership.isOfflineMember,
    members: membership.members,
    tierId: membership.tierId,
    tierName: membership.tierName,
    price: membership.price,
    durationDays: membership.durationDays,
    sessions: membership.sessions,
    sessionsUsed: 0,
    startDate,
    endDate,
    status: "active" as const,
    pausedAt: null as number | null,
    totalPausedDays: 0,
  };
  const docRef = await addDoc(membershipsCollection(membership.poolId), record);
  await logMembershipEdit(membership.poolId, docRef.id, {
    ...actor,
    type: "created",
    summary: `${membership.durationDays} days · ${membership.tierName}`,
    at: startDate,
  });
  return { id: docRef.id, poolId: membership.poolId, ...record };
}

export async function listMembershipsByPool(poolId: string): Promise<Membership[]> {
  const snapshot = await getDocs(membershipsCollection(poolId));
  return snapshot.docs
    .map((docSnap) => toMembership(docSnap.id, poolId, docSnap.data()))
    .sort((a, b) => b.startDate - a.startDate);
}

export async function getMembershipById(poolId: string, membershipId: string): Promise<Membership | null> {
  const snapshot = await getDoc(doc(db, "pools", poolId, "memberships", membershipId));
  if (!snapshot.exists()) return null;
  return toMembership(snapshot.id, poolId, snapshot.data() ?? {});
}

export async function setMembershipStatus(poolId: string, membershipId: string, status: MembershipStatus): Promise<void> {
  await updateDoc(doc(db, "pools", poolId, "memberships", membershipId), { status });
}

// Pause stops the tenure clock (recorded via pausedAt); resume pushes
// end-date out by however long the member was paused and logs both a
// "paused N days" summary (backdated to when the pause started) and a
// "resumed" entry, for the Membership History screen.
export async function pauseMembership(poolId: string, membershipId: string): Promise<void> {
  await updateDoc(doc(db, "pools", poolId, "memberships", membershipId), { status: "inactive", pausedAt: Date.now() });
}

export async function resumeMembership(poolId: string, membership: Membership, actor: MembershipActor): Promise<void> {
  const now = Date.now();
  const pausedAt = membership.pausedAt ?? now;
  const pausedMs = Math.max(0, now - pausedAt);
  const days = Math.round(pausedMs / (24 * 60 * 60 * 1000));
  const nextEndDate = membership.endDate + pausedMs;
  const nextTotalPaused = membership.totalPausedDays + days;

  await updateDoc(doc(db, "pools", poolId, "memberships", membership.id), {
    status: "active",
    pausedAt: null,
    endDate: nextEndDate,
    totalPausedDays: nextTotalPaused,
  });

  if (days > 0) {
    await logMembershipEdit(poolId, membership.id, { ...actor, type: "pause", summary: `${days} day${days === 1 ? "" : "s"}`, at: pausedAt });
  }
  await logMembershipEdit(poolId, membership.id, { ...actor, type: "resume", summary: "Resumed", at: now });
}

// Deducts one session from a membership on exit from a free member entry.
export async function recordMembershipVisit(poolId: string, membershipId: string, nextSessionsUsed: number): Promise<void> {
  await updateDoc(doc(db, "pools", poolId, "memberships", membershipId), { sessionsUsed: nextSessionsUsed });
}

// Facility-side edit from the Member Detail screen: switch tier (relabel
// only - remaining days are left untouched, never reset to the new tier's
// duration), adjust remaining days by a delta (comps/corrections), or set
// tenure dates directly. Callers pass only the fields being changed.
export type MembershipEdit = {
  tierId?: string;
  tierName?: string;
  startDate?: number;
  endDate?: number;
};

export async function editMembership(poolId: string, membershipId: string, edit: MembershipEdit): Promise<void> {
  const patch: Record<string, number | string> = {};
  if (edit.tierId !== undefined) patch.tierId = edit.tierId;
  if (edit.tierName !== undefined) patch.tierName = edit.tierName;
  if (edit.startDate !== undefined) patch.startDate = edit.startDate;
  if (edit.endDate !== undefined) patch.endDate = edit.endDate;
  await updateDoc(doc(db, "pools", poolId, "memberships", membershipId), patch);
}

// Used on the member-facing side to look up the signed-in user's own
// memberships for a pool (current + history, newest first), so facility-side
// activate/deactivate is reflected there. Only the caller's own phone number
// is queryable (see firestore.rules).
export async function listMembershipsByPhone(poolId: string, phone: string): Promise<Membership[]> {
  const snapshot = await getDocs(query(membershipsCollection(poolId), where("phone", "==", phone)));
  return snapshot.docs
    .map((docSnap) => toMembership(docSnap.id, poolId, docSnap.data()))
    .sort((a, b) => b.startDate - a.startDate);
}

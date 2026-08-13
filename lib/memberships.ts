import { addDoc, collection, doc, getDocs, getFirestore, query, updateDoc, where } from "@react-native-firebase/firestore";

const db = getFirestore();

export type MembershipTierId = "splash" | "swimmer" | "pro";

export type MembershipTier = {
  id: MembershipTierId;
  name: string;
  durationDays: number;
  sessions: number;
  price: number;
  coachingAvailable: boolean;
};

export const MEMBERSHIP_TIERS: MembershipTier[] = [
  { id: "splash", name: "Splash", durationDays: 30, sessions: 25, price: 3000, coachingAvailable: true },
  { id: "swimmer", name: "Swimmer", durationDays: 60, sessions: 50, price: 4500, coachingAvailable: true },
  { id: "pro", name: "Pro", durationDays: 90, sessions: 75, price: 6000, coachingAvailable: true },
];

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
  tierId: MembershipTierId;
  tierName: string;
  price: number;
  durationDays: number;
  sessions: number;
  startDate: number;
  endDate: number;
  status: MembershipStatus;
};

export type NewMembership = {
  poolId: string;
  phone: string;
  isOfflineMember: boolean;
  members: MembershipMember[];
  tierId: MembershipTierId;
  tierName: string;
  price: number;
  durationDays: number;
  sessions: number;
};

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
    tierId: (data.tierId as MembershipTierId) ?? "splash",
    tierName: typeof data.tierName === "string" ? data.tierName : "Splash",
    price: typeof data.price === "number" ? data.price : 0,
    durationDays: typeof data.durationDays === "number" ? data.durationDays : 30,
    sessions: typeof data.sessions === "number" ? data.sessions : 0,
    startDate: typeof data.startDate === "number" ? data.startDate : 0,
    endDate: typeof data.endDate === "number" ? data.endDate : 0,
    status: data.status === "inactive" ? "inactive" : "active",
  };
}

export async function addMembership(membership: NewMembership): Promise<Membership> {
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
    startDate,
    endDate,
    status: "active" as const,
  };
  const docRef = await addDoc(membershipsCollection(membership.poolId), record);
  return { id: docRef.id, poolId: membership.poolId, ...record };
}

export async function listMembershipsByPool(poolId: string): Promise<Membership[]> {
  const snapshot = await getDocs(membershipsCollection(poolId));
  return snapshot.docs
    .map((docSnap) => toMembership(docSnap.id, poolId, docSnap.data()))
    .sort((a, b) => b.startDate - a.startDate);
}

export async function setMembershipStatus(poolId: string, membershipId: string, status: MembershipStatus): Promise<void> {
  await updateDoc(doc(db, "pools", poolId, "memberships", membershipId), { status });
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

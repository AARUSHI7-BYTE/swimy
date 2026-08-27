import { addDoc, collection, doc, getDocs, getFirestore, updateDoc } from "@react-native-firebase/firestore";

const db = getFirestore();

// A tier is a named, priced membership plan with a fixed duration - there is
// no separate tier-vs-duration axis. Facility staff configure these per pool
// from Settings -> Membership Management -> Tiers; the signup wizard reads
// from here instead of a hardcoded plan list.
export type MembershipTier = {
  id: string;
  poolId: string;
  name: string;
  price: number;
  durationDays: number;
  sessions: number | null; // null = unlimited
  pauseDaysAllowed: number | null;
  archived: boolean;
  createdAt: number;
};

export type NewMembershipTier = {
  poolId: string;
  name: string;
  price: number;
  durationDays: number;
  sessions: number | null;
  pauseDaysAllowed: number | null;
  archived: boolean;
};

export type TierUpdate = {
  name: string;
  price: number;
  durationDays: number;
  sessions: number | null;
  pauseDaysAllowed: number | null;
  archived: boolean;
};

function tiersCollection(poolId: string) {
  return collection(db, "pools", poolId, "membershipTiers");
}

function toTier(id: string, poolId: string, data: Record<string, unknown>): MembershipTier {
  return {
    id,
    poolId,
    name: typeof data.name === "string" ? data.name : "",
    price: typeof data.price === "number" ? data.price : 0,
    durationDays: typeof data.durationDays === "number" ? data.durationDays : 0,
    sessions: typeof data.sessions === "number" ? data.sessions : null,
    pauseDaysAllowed: typeof data.pauseDaysAllowed === "number" ? data.pauseDaysAllowed : null,
    archived: Boolean(data.archived),
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
  };
}

export async function listTiers(poolId: string): Promise<MembershipTier[]> {
  const snapshot = await getDocs(tiersCollection(poolId));
  return snapshot.docs.map((docSnap) => toTier(docSnap.id, poolId, docSnap.data())).sort((a, b) => b.createdAt - a.createdAt);
}

export async function addTier(tier: NewMembershipTier): Promise<MembershipTier> {
  const record = {
    name: tier.name,
    price: tier.price,
    durationDays: tier.durationDays,
    sessions: tier.sessions,
    pauseDaysAllowed: tier.pauseDaysAllowed,
    archived: tier.archived,
    createdAt: Date.now(),
  };
  const docRef = await addDoc(tiersCollection(tier.poolId), record);
  return { id: docRef.id, poolId: tier.poolId, ...record };
}

export async function updateTier(poolId: string, tierId: string, update: TierUpdate): Promise<void> {
  await updateDoc(doc(db, "pools", poolId, "membershipTiers", tierId), update);
}

// Tiers are never hard-deleted (existing members must keep referencing the
// tier they signed up under) - archiving just hides it from new signups.
export async function setTierArchived(poolId: string, tierId: string, archived: boolean): Promise<void> {
  await updateDoc(doc(db, "pools", poolId, "membershipTiers", tierId), { archived });
}

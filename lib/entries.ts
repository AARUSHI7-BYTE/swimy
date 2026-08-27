import { addDoc, collection, doc, getDocs, getFirestore, increment, onSnapshot, query, updateDoc, where, type Unsubscribe } from "@react-native-firebase/firestore";
import type { PricingConfig } from "./pricing";

const db = getFirestore();

export type EntryPerson = {
  name: string;
  age?: number;
  gender?: string;
};

export type Entry = {
  id: string;
  poolId: string;
  uid: string;
  people: EntryPerson[];
  enteredAt: number;
  exitedAt: number | null;
  price: number | null;
  // Pricing config captured at check-in time, so a later pricing-model change
  // by the facility never reprices a session that's already in progress.
  pricingSnapshot?: PricingConfig;
  // Set when this visit was let in free against a membership session instead
  // of being billed - checkout skips computeDue and deducts a session instead.
  membershipId?: string;
};

function entriesCollection(poolId: string) {
  return collection(db, "pools", poolId, "entries");
}

function toEntry(id: string, poolId: string, data: Record<string, unknown>): Entry {
  return {
    id,
    poolId,
    uid: typeof data.uid === "string" ? data.uid : "",
    people: Array.isArray(data.people) ? (data.people as EntryPerson[]) : [],
    enteredAt: typeof data.enteredAt === "number" ? data.enteredAt : 0,
    exitedAt: typeof data.exitedAt === "number" ? data.exitedAt : null,
    price: typeof data.price === "number" ? data.price : null,
    pricingSnapshot: (data.pricingSnapshot as PricingConfig | undefined) ?? undefined,
    membershipId: typeof data.membershipId === "string" ? data.membershipId : undefined,
  };
}

export async function getOpenEntry(poolId: string, uid: string): Promise<Entry | null> {
  const snapshot = await getDocs(query(entriesCollection(poolId), where("uid", "==", uid), where("exitedAt", "==", null)));
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  return toEntry(docSnap.id, poolId, docSnap.data());
}

export async function checkIn(
  poolId: string,
  uid: string,
  people: EntryPerson[],
  pricingSnapshot: PricingConfig,
  membershipId?: string
): Promise<Entry> {
  const existing = await getOpenEntry(poolId, uid);
  if (existing) {
    throw new Error("Already checked in at this pool.");
  }
  const enteredAt = Date.now();
  const docRef = await addDoc(entriesCollection(poolId), {
    uid,
    people,
    enteredAt,
    exitedAt: null,
    price: null,
    pricingSnapshot,
    ...(membershipId ? { membershipId } : {}),
  });
  await updateDoc(doc(db, "pools", poolId), { liveOccupancy: increment(1) }).catch(() => {});
  return { id: docRef.id, poolId, uid, people, enteredAt, exitedAt: null, price: null, pricingSnapshot, membershipId };
}

export async function checkOut(poolId: string, uid: string, price: number): Promise<Entry> {
  const existing = await getOpenEntry(poolId, uid);
  if (!existing) {
    throw new Error("No active entry found for this pass.");
  }
  const exitedAt = Date.now();
  await updateDoc(doc(db, "pools", poolId, "entries", existing.id), { exitedAt, price });
  await updateDoc(doc(db, "pools", poolId), { liveOccupancy: increment(-1) }).catch(() => {});
  return { ...existing, exitedAt, price };
}

function startOfToday(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

export async function listTodayEntries(poolId: string): Promise<Entry[]> {
  const snapshot = await getDocs(entriesCollection(poolId));
  const todayStart = startOfToday();
  return snapshot.docs
    .map((docSnap) => toEntry(docSnap.id, poolId, docSnap.data()))
    .filter((entry) => entry.enteredAt >= todayStart)
    .sort((a, b) => b.enteredAt - a.enteredAt);
}

// Fetches every entry for the pool once and filters client-side, since the
// collection has no server-side date index and facility pools are low-volume.
export async function listEntriesInRange(poolId: string, startMs: number, endMs: number): Promise<Entry[]> {
  const snapshot = await getDocs(entriesCollection(poolId));
  return snapshot.docs
    .map((docSnap) => toEntry(docSnap.id, poolId, docSnap.data()))
    .filter((entry) => entry.enteredAt >= startMs && entry.enteredAt < endMs)
    .sort((a, b) => b.enteredAt - a.enteredAt);
}

// Full visit history for a swimmer at this pool (most recent first), used to
// render "My Swims" on the member-facing account screen.
export async function listEntriesByUser(poolId: string, uid: string): Promise<Entry[]> {
  const snapshot = await getDocs(query(entriesCollection(poolId), where("uid", "==", uid)));
  return snapshot.docs
    .map((docSnap) => toEntry(docSnap.id, poolId, docSnap.data()))
    .sort((a, b) => b.enteredAt - a.enteredAt);
}

// Live-updates with the swimmer's most recent entry at this pool, so the
// consumer app can pop up "Entry Confirmed" / "Payment Due" as staff scan.
export function subscribeToLatestEntry(poolId: string, uid: string, callback: (entry: Entry | null) => void): Unsubscribe {
  return onSnapshot(
    query(entriesCollection(poolId), where("uid", "==", uid)),
    (snapshot) => {
      if (!snapshot || snapshot.empty) {
        callback(null);
        return;
      }
      const entries = snapshot.docs.map((docSnap) => toEntry(docSnap.id, poolId, docSnap.data()));
      entries.sort((a, b) => b.enteredAt - a.enteredAt);
      callback(entries[0]);
    },
    (error) => {
      console.error("subscribeToLatestEntry error:", error);
      callback(null);
    },
  );
}


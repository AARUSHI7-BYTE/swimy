import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, query, setDoc, where } from "@react-native-firebase/firestore";
import { randomUUID } from "expo-crypto";

const db = getFirestore();

export type UserRole = "user" | "admin" | "facility";

export type UserDocument = {
  uid: string;
  phoneNumber: string;
  role: UserRole;
  poolIds: string[];
  photoUrl?: string;
};

function normalizeRole(role: unknown): UserRole {
  if (role === "admin" || role === "facility") return role;
  return "user";
}

// Creates a users/{uid} doc with default role "user" on first login, otherwise
// returns the existing doc. Role/poolIds are never auto-elevated here -
// admin/facility access must be granted manually in Firestore.
export async function ensureUserDocument(uid: string, phoneNumber: string): Promise<UserDocument> {
  const userRef = doc(db, "users", uid);
  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) {
    const data = snapshot.data() ?? {};
    return {
      uid,
      phoneNumber: typeof data.phoneNumber === "string" ? data.phoneNumber : phoneNumber,
      role: normalizeRole(data.role),
      poolIds: Array.isArray(data.poolIds) ? data.poolIds : [],
      photoUrl: typeof data.photoUrl === "string" ? data.photoUrl : undefined,
    };
  }

  const newUser = { phoneNumber, role: "user" as const, poolIds: [] as string[] };
  await setDoc(userRef, newUser);
  return { uid, ...newUser };
}

// Persists the download URL for the swimmer's profile photo, uploaded via
// uploadUserPhoto(), so facility staff can see it on the entry scan pop-up.
export async function updateUserPhoto(uid: string, photoUrl: string): Promise<void> {
  await setDoc(doc(db, "users", uid), { photoUrl }, { merge: true });
}

// Used by the Staff scan flow to resolve a scanning uid's phone number, so
// coaching-segment restricted-timing rules can be checked against that
// phone's memberships. Read-only - never creates a doc.
export async function getUserById(uid: string): Promise<UserDocument | null> {
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() ?? {};
  return {
    uid,
    phoneNumber: typeof data.phoneNumber === "string" ? data.phoneNumber : "",
    role: normalizeRole(data.role),
    poolIds: Array.isArray(data.poolIds) ? data.poolIds : [],
    photoUrl: typeof data.photoUrl === "string" ? data.photoUrl : undefined,
  };
}

// Used by the facility console to detect a returning member by phone number
// during membership sign-up, ahead of collecting fresh membership details.
export async function getUserByPhone(phoneNumber: string): Promise<UserDocument | null> {
  const snapshot = await getDocs(query(collection(db, "users"), where("phoneNumber", "==", phoneNumber)));
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  const data = docSnap.data() ?? {};
  return {
    uid: docSnap.id,
    phoneNumber: typeof data.phoneNumber === "string" ? data.phoneNumber : phoneNumber,
    role: normalizeRole(data.role),
    poolIds: Array.isArray(data.poolIds) ? data.poolIds : [],
    photoUrl: typeof data.photoUrl === "string" ? data.photoUrl : undefined,
  };
}

export type PricingModelId = "A" | "B" | "C" | "D";

export type PoolPricingSlab = { label: string; startMin: number; endMin: number; price: number };

export type Pool = {
  id: string;
  poolId: string;
  name: string;
  location: string;
  covered: boolean;
  kidsPool: boolean;
  size: string;
  imageKey: string;
  imageUrl: string;
  active: boolean;
  pricePerVisit: number;
  pricingModel: PricingModelId;
  baseCharge?: number;
  perMinCharge?: number;
  slotPrice?: number;
  overagePerMin?: number;
  slabs?: PoolPricingSlab[];
  lateExitPerMin?: number;
  maxOccupancy?: number | null;
  liveOccupancy?: number;
  operatingHours?: string;
  contactInfo?: string;
  photos?: string[];
  primaryPhotoIndex?: number;
};

const DEFAULT_PRICE_PER_VISIT = 150;

function toPool(id: string, data: Record<string, unknown>): Pool {
  const pricePerVisit = typeof data.pricePerVisit === "number" ? data.pricePerVisit : DEFAULT_PRICE_PER_VISIT;
  return {
    id,
    poolId: typeof data.poolId === "string" ? data.poolId : id,
    name: (data.name as string) ?? "",
    location: (data.location as string) ?? "",
    covered: Boolean(data.covered),
    kidsPool: Boolean(data.kidsPool),
    size: (data.size as string) ?? "",
    imageKey: (data.imageKey as string) ?? id,
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
    active: data.active === false ? false : true,
    pricePerVisit,
    pricingModel: (data.pricingModel as PricingModelId) ?? "B",
    baseCharge: typeof data.baseCharge === "number" ? data.baseCharge : undefined,
    perMinCharge: typeof data.perMinCharge === "number" ? data.perMinCharge : undefined,
    slotPrice: typeof data.slotPrice === "number" ? data.slotPrice : undefined,
    overagePerMin: typeof data.overagePerMin === "number" ? data.overagePerMin : undefined,
    slabs: Array.isArray(data.slabs) ? (data.slabs as PoolPricingSlab[]) : undefined,
    lateExitPerMin: typeof data.lateExitPerMin === "number" ? data.lateExitPerMin : undefined,
    maxOccupancy: typeof data.maxOccupancy === "number" ? data.maxOccupancy : null,
    liveOccupancy: typeof data.liveOccupancy === "number" ? data.liveOccupancy : 0,
    operatingHours: typeof data.operatingHours === "string" ? data.operatingHours : undefined,
    contactInfo: typeof data.contactInfo === "string" ? data.contactInfo : undefined,
    photos: Array.isArray(data.photos) ? (data.photos as string[]) : undefined,
    primaryPhotoIndex: typeof data.primaryPhotoIndex === "number" ? data.primaryPhotoIndex : undefined,
  };
}

export async function getAllPools(): Promise<Pool[]> {
  const snapshot = await getDocs(collection(db, "pools"));
  return snapshot.docs.map((docSnap) => toPool(docSnap.id, docSnap.data()));
}

export async function getPoolsByIds(poolIds: string[]): Promise<Pool[]> {
  if (poolIds.length === 0) return [];
  const allPools = await getAllPools();
  return allPools.filter((pool) => poolIds.includes(pool.id));
}

export async function getPoolById(poolId: string): Promise<Pool | null> {
  const snapshot = await getDoc(doc(db, "pools", poolId));
  if (!snapshot.exists()) return null;
  return toPool(snapshot.id, snapshot.data() ?? {});
}

export type NewPool = {
  name: string;
  location: string;
  covered: boolean;
  kidsPool: boolean;
  size: string;
  imageUrl: string;
  pricePerVisit: number;
};

// Admins add pools to the shared catalog. The document id is a client-generated
// UUID so the pool image can be uploaded to a matching Storage path before the
// Firestore write happens. New pools are active by default and default into
// pricing model B (matching the previous single-price behavior) so the
// facility can refine pricing later from the Settings tab.
export async function addPool(pool: NewPool): Promise<string> {
  const poolId = randomUUID();
  const poolRef = doc(collection(db, "pools"), poolId);
  await setDoc(poolRef, {
    ...pool,
    poolId: poolRef.id,
    imageKey: poolRef.id,
    active: true,
    pricingModel: "B" as PricingModelId,
    slotPrice: pool.pricePerVisit,
    overagePerMin: Math.round(pool.pricePerVisit / 60),
    liveOccupancy: 0,
  });
  return poolRef.id;
}

export async function updatePoolImageUrl(poolId: string, imageUrl: string): Promise<void> {
  await setDoc(doc(db, "pools", poolId), { imageUrl }, { merge: true });
}

export async function deletePool(poolId: string): Promise<void> {
  await deleteDoc(doc(db, "pools", poolId));
}

export type PricingUpdate =
  | { pricingModel: "A"; baseCharge: number; perMinCharge: number }
  | { pricingModel: "B"; slotPrice: number; overagePerMin: number }
  | { pricingModel: "C"; slabs: PoolPricingSlab[]; lateExitPerMin: number };

// Facility self-service writes are restricted by firestore.rules to this
// allow-listed set of fields - admins keep exclusive control of identity
// fields (name, location, active, poolIds assignment).
export async function updatePoolPricing(poolId: string, update: PricingUpdate): Promise<void> {
  await setDoc(doc(db, "pools", poolId), update, { merge: true });
}

export async function updatePoolCapacity(poolId: string, maxOccupancy: number | null): Promise<void> {
  await setDoc(doc(db, "pools", poolId), { maxOccupancy }, { merge: true });
}

export type PoolProfileUpdate = {
  operatingHours: string;
  contactInfo: string;
  photos: string[];
  primaryPhotoIndex: number;
};

export async function updatePoolProfile(poolId: string, update: PoolProfileUpdate): Promise<void> {
  await setDoc(doc(db, "pools", poolId), update, { merge: true });
}

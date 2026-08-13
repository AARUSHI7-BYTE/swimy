import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, query, setDoc, where } from "@react-native-firebase/firestore";
import { randomUUID } from "expo-crypto";

const db = getFirestore();

export type UserRole = "user" | "admin" | "facility";

export type UserDocument = {
  uid: string;
  phoneNumber: string;
  role: UserRole;
  poolIds: string[];
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
    };
  }

  const newUser = { phoneNumber, role: "user" as const, poolIds: [] as string[] };
  await setDoc(userRef, newUser);
  return { uid, ...newUser };
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
  };
}

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
};

const DEFAULT_PRICE_PER_VISIT = 150;

export async function getAllPools(): Promise<Pool[]> {
  const snapshot = await getDocs(collection(db, "pools"));
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      poolId: typeof data.poolId === "string" ? data.poolId : docSnap.id,
      name: data.name ?? "",
      location: data.location ?? "",
      covered: Boolean(data.covered),
      kidsPool: Boolean(data.kidsPool),
      size: data.size ?? "",
      imageKey: data.imageKey ?? docSnap.id,
      imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
      active: data.active === false ? false : true,
      pricePerVisit: typeof data.pricePerVisit === "number" ? data.pricePerVisit : DEFAULT_PRICE_PER_VISIT,
    };
  });
}

export async function getPoolsByIds(poolIds: string[]): Promise<Pool[]> {
  if (poolIds.length === 0) return [];
  const allPools = await getAllPools();
  return allPools.filter((pool) => poolIds.includes(pool.id));
}

export async function getPoolById(poolId: string): Promise<Pool | null> {
  const snapshot = await getDoc(doc(db, "pools", poolId));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() ?? {};
  return {
    id: snapshot.id,
    poolId: typeof data.poolId === "string" ? data.poolId : snapshot.id,
    name: data.name ?? "",
    location: data.location ?? "",
    covered: Boolean(data.covered),
    kidsPool: Boolean(data.kidsPool),
    size: data.size ?? "",
    imageKey: data.imageKey ?? snapshot.id,
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
    active: data.active === false ? false : true,
    pricePerVisit: typeof data.pricePerVisit === "number" ? data.pricePerVisit : DEFAULT_PRICE_PER_VISIT,
  };
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
// Firestore write happens. New pools are active by default.
export async function addPool(pool: NewPool): Promise<string> {
  const poolId = randomUUID();
  const poolRef = doc(collection(db, "pools"), poolId);
  await setDoc(poolRef, { ...pool, poolId: poolRef.id, imageKey: poolRef.id, active: true });
  return poolRef.id;
}

export async function updatePoolImageUrl(poolId: string, imageUrl: string): Promise<void> {
  await setDoc(doc(db, "pools", poolId), { imageUrl }, { merge: true });
}

export async function deletePool(poolId: string): Promise<void> {
  await deleteDoc(doc(db, "pools", poolId));
}

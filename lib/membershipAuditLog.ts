import { addDoc, collection, getDocs, getFirestore } from "@react-native-firebase/firestore";

const db = getFirestore();

export type MembershipAuditType = "created" | "daysAdjust" | "pause" | "resume" | "tierChange";

export type MembershipAuditEntry = {
  id: string;
  actorUid: string;
  actorRole: string;
  type: MembershipAuditType;
  summary: string;
  at: number;
};

// Who/when/what trail for a membership's lifecycle - created, tier switches,
// day/tenure adjustments, and pause/resume cycles. Lives under the
// membership doc itself so it's naturally scoped by the same pool-level
// access rules. `summary` is a short right-aligned value (e.g. "+5 days",
// "Splash -> Swimmer") - the human title is derived from `type` at render
// time so it can be localized/filtered consistently.
export async function logMembershipEdit(
  poolId: string,
  membershipId: string,
  entry: { actorUid: string; actorRole: string; type: MembershipAuditType; summary: string; at?: number }
): Promise<void> {
  await addDoc(collection(db, "pools", poolId, "memberships", membershipId, "auditLog"), {
    actorUid: entry.actorUid,
    actorRole: entry.actorRole,
    type: entry.type,
    summary: entry.summary,
    at: entry.at ?? Date.now(),
  });
}

export async function listMembershipAuditLog(poolId: string, membershipId: string): Promise<MembershipAuditEntry[]> {
  const snapshot = await getDocs(collection(db, "pools", poolId, "memberships", membershipId, "auditLog"));
  return snapshot.docs
    .map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        actorUid: typeof data.actorUid === "string" ? data.actorUid : "",
        actorRole: typeof data.actorRole === "string" ? data.actorRole : "",
        type: (["created", "daysAdjust", "pause", "resume", "tierChange"].includes(data.type as string) ? data.type : "daysAdjust") as MembershipAuditType,
        summary: typeof data.summary === "string" ? data.summary : "",
        at: typeof data.at === "number" ? data.at : 0,
      };
    })
    .sort((a, b) => b.at - a.at);
}

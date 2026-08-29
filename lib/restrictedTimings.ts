import { addDoc, collection, deleteDoc, doc, getDocs, getFirestore } from "@react-native-firebase/firestore";
import type { EntryPerson } from "./entries";

const db = getFirestore();

export type Segment = "women" | "senior" | "children" | "coaching";

export type RestrictedRule = {
  id: string;
  poolId: string;
  segment: Segment;
  days: number[]; // 0 = Sunday .. 6 = Saturday
  startMin: number; // minutes since midnight
  endMin: number; // minutes since midnight
  ageThreshold?: number; // senior: age >= threshold, children: age <= threshold
  label?: string;
};

export type NewRestrictedRule = Omit<RestrictedRule, "id" | "poolId">;

function rulesCollection(poolId: string) {
  return collection(db, "pools", poolId, "restrictedTimings");
}

function toRule(id: string, poolId: string, data: Record<string, unknown>): RestrictedRule {
  return {
    id,
    poolId,
    segment: (data.segment as Segment) ?? "women",
    days: Array.isArray(data.days) ? (data.days as number[]) : [],
    startMin: typeof data.startMin === "number" ? data.startMin : 0,
    endMin: typeof data.endMin === "number" ? data.endMin : 0,
    ageThreshold: typeof data.ageThreshold === "number" ? data.ageThreshold : undefined,
    label: typeof data.label === "string" ? data.label : undefined,
  };
}

// Any signed-in user can read restrictedTimings (see firestore.rules) so
// members see the same rules facility staff set. Still swallow a
// permission-denied here rather than surfacing a broken screen, in case
// rules are ever tightened again for a signed-out/edge-case caller.
export async function listRules(poolId: string): Promise<RestrictedRule[]> {
  try {
    const snapshot = await getDocs(rulesCollection(poolId));
    return snapshot.docs.map((docSnap) => toRule(docSnap.id, poolId, docSnap.data()));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "firestore/permission-denied") {
      return [];
    }
    throw error;
  }
}

export async function addRule(poolId: string, rule: NewRestrictedRule): Promise<RestrictedRule> {
  // Firestore rejects `undefined` field values, and optional fields like
  // ageThreshold/label are commonly passed as undefined from the UI - strip
  // them before writing rather than letting the mutation fail.
  const data = Object.fromEntries(Object.entries(rule).filter(([, value]) => value !== undefined)) as NewRestrictedRule;
  const docRef = await addDoc(rulesCollection(poolId), data);
  return { id: docRef.id, poolId, ...rule };
}

export async function deleteRule(poolId: string, ruleId: string): Promise<void> {
  await deleteDoc(doc(db, "pools", poolId, "restrictedTimings", ruleId));
}

export function activeRulesAt(rules: RestrictedRule[], date: Date): RestrictedRule[] {
  const day = date.getDay();
  const minuteOfDay = date.getHours() * 60 + date.getMinutes();
  return rules.filter((rule) => rule.days.includes(day) && minuteOfDay >= rule.startMin && minuteOfDay < rule.endMin);
}

const SEGMENT_LABELS: Record<Segment, string> = {
  women: "Women only",
  senior: "Senior Citizens only",
  children: "Children only",
  coaching: "Coaching only",
};

export function segmentLabel(segment: Segment): string {
  return SEGMENT_LABELS[segment];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatMinutes(min: number): string {
  const hours24 = Math.floor(min / 60);
  const mins = min % 60;
  const period = hours24 >= 12 ? "pm" : "am";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return mins === 0 ? `${hours12}${period}` : `${hours12}:${String(mins).padStart(2, "0")}${period}`;
}

export function formatRule(rule: RestrictedRule): string {
  const sortedDays = [...rule.days].sort((a, b) => a - b);
  const days = sortedDays.length === 7 ? "Every day" : sortedDays.map((d) => DAY_LABELS[d]).join(", ");
  return `${segmentLabel(rule.segment)} · ${days} · ${formatMinutes(rule.startMin)}–${formatMinutes(rule.endMin)}`;
}

function personMatchesSegment(rule: RestrictedRule, person: EntryPerson, coachingByName: (name: string) => boolean): boolean {
  if (rule.segment === "women") {
    return (person.gender || "").toLowerCase().startsWith("f");
  }
  if (rule.segment === "senior") {
    if (typeof person.age !== "number") return false;
    return person.age >= (rule.ageThreshold ?? 60);
  }
  if (rule.segment === "children") {
    if (typeof person.age !== "number") return false;
    return person.age <= (rule.ageThreshold ?? 12);
  }
  // coaching
  return coachingByName(person.name);
}

export type EntryEvaluation = { allowed: boolean; reason?: string };

// Every person in the scanned group must match at least one currently active
// rule's segment, or the whole entry is blocked - matching the facility's
// "check each member, block if any fails" requirement for group/family QR.
export function evaluateEntry(
  rules: RestrictedRule[],
  people: EntryPerson[],
  now: Date,
  coachingByName: (name: string) => boolean = () => false
): EntryEvaluation {
  const active = activeRulesAt(rules, now);
  if (active.length === 0) return { allowed: true };

  for (const person of people) {
    const matches = active.some((rule) => personMatchesSegment(rule, person, coachingByName));
    if (!matches) {
      const windows = active.map((rule) => segmentLabel(rule.segment)).join(" / ");
      return {
        allowed: false,
        reason: `${windows} right now — ${person.name || "a member of this group"} isn't eligible to enter.`,
      };
    }
  }
  return { allowed: true };
}

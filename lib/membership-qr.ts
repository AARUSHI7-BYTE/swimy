// The membership ID card carries one fixed QR for the whole membership
// (unlike the home screen's per-visit entry QR) - facility scans it at both
// entry and exit, auto-detecting which based on whether an entry is open.
// A renewed/replacement membership gets a new membershipId, so its card's
// QR is naturally a different code once the old one is used up or expires.
export type MembershipQrPayload = {
  type: "swimy-membership";
  uid: string;
  phone: string;
  poolId: string;
  membershipId: string;
  person?: { name: string; age?: number; gender?: string };
};

export function buildMembershipQrValue(payload: MembershipQrPayload): string {
  return JSON.stringify(payload);
}

export function parseMembershipQrPayload(raw: string): MembershipQrPayload | null {
  try {
    const data = JSON.parse(raw);
    if (
      data &&
      data.type === "swimy-membership" &&
      typeof data.uid === "string" &&
      typeof data.phone === "string" &&
      typeof data.poolId === "string" &&
      typeof data.membershipId === "string"
    ) {
      return data as MembershipQrPayload;
    }
  } catch {
    // not a Swimy membership QR
  }
  return null;
}

import { Membership } from "./memberships";
import { Pool } from "./firestore";

export type IdCardMember = {
  name: string;
  age?: number;
  gender?: string;
  phoneDigits: string;
  photoUrl?: string | null;
  coaching: boolean;
};

function esc(value: string | number | undefined): string {
  if (value === undefined) return "";
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const RULES = [
  "(a) Non-swimmers shall not cross the barrier put up for restricting them from going into the deeper portion of the swimming pool. They do so at their own risk. (b) Non-swimmers shall wear a Red Cap.",
  "Any injuries or loss of life during the swimming period will be the risk of the swimmer. The swimming pool management shall not be responsible in any manner.",
  "No compensation or claim shall be entertained in case of any mishap or loss during the swimming period.",
  "Seasonal and monthly ticket holders will be allowed to swim only in the allotted time and session as indicated on their card.",
  "Permission to use the swimming pool can be terminated at any time without assigning any reason.",
  "All swimmers shall swim in proper costume. A cap is compulsory for long-haired swimmers.",
  "All instructions given by the person in charge shall be strictly followed.",
  "The user card must be presented to the gatekeeper at the time of entry.",
  "Money once paid will not be refunded, transferred, or adjusted.",
  "Pay for your renewal within three days of expiry.",
  "The swimming pool will remain closed every Monday.",
  "No adjustment for days of absence shall be entertained.",
];

const SPECIAL_INSTRUCTIONS = [
  "Children below the age of 5 years will not be allowed to enter the swimming pool premises.",
  "All users must take a proper bath before entering the pool.",
  "Do not apply any lotion or cream on the body before entering the pool.",
  "No person shall keep any valuables, watch, purse, money, or ornaments in the lockers. If anyone does so, it is at their own risk and responsibility.",
  "No eatables shall be brought into the swimming pool premises.",
  "Children between 5 to 8 years will be allowed only if accompanied by an adult in the water.",
  "Do not enter the pool after consuming alcohol or any other intoxicating substance.",
  "Each shift will end 15 minutes before the start of the next shift for shower and change of clothes.",
  "Admission fee is not refundable under any condition.",
];

export function buildIdCardHtml(pool: Pool, membership: Membership, member: IdCardMember, qrDataUri: string): string {
  const footer = `${esc(pool.location)}${pool.contactInfo ? ` · Phone: ${esc(pool.contactInfo)}` : ""}`;
  const remaining = membership.sessions == null ? null : Math.max(0, membership.sessions - membership.sessionsUsed);
  const photoBlock = member.photoUrl
    ? `<img src="${esc(member.photoUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />`
    : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px 40px; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 3px solid #2952e3; padding-bottom: 14px; }
  .logo { width: 64px; height: 64px; border-radius: 32px; background: #2952e3; color: #fff; font-weight: 700; font-size: 15px; display: flex; align-items: center; justify-content: center; letter-spacing: 0.5px; }
  .poolName { color: #2952e3; font-size: 24px; font-weight: 700; text-align: right; margin: 0; }
  .poolMeta { color: #555; font-size: 12px; text-align: right; margin-top: 4px; }
  h2.section { color: #2952e3; font-size: 15px; letter-spacing: 0.5px; margin: 26px 0 12px; }
  .detailsRow { display: flex; }
  .photoBox { width: 130px; height: 150px; border: 1px solid #ccc; border-radius: 8px; margin-right: 24px; overflow: hidden; }
  table.details { flex: 1; border-collapse: collapse; width: 100%; }
  table.details td { padding: 7px 0; font-size: 13px; border-bottom: 1px solid #eee; }
  table.details td.label { color: #666; width: 45%; }
  table.details td.value { text-align: right; font-weight: 700; }
  .qrWrap { text-align: center; margin: 28px 0 10px; }
  .qrWrap img { width: 190px; height: 190px; }
  .qrCaption { font-size: 12px; color: #555; margin-top: 6px; }
  ul.decl { padding-left: 18px; font-size: 12px; line-height: 1.6; margin: 8px 0; }
  .hindiNote { text-align: center; font-weight: 700; font-size: 12.5px; margin: 12px 0; }
  ol.rules { padding-left: 18px; font-size: 11.5px; line-height: 1.55; margin: 8px 0; }
  .footer { border-top: 1px solid #ddd; margin-top: 26px; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10.5px; color: #777; }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">SWIMY</div>
    <div>
      <p class="poolName">${esc(pool.name)}</p>
      <div class="poolMeta">${footer}</div>
    </div>
  </div>

  <h2 class="section">MEMBER DETAILS</h2>
  <div class="detailsRow">
    <div class="photoBox">${photoBlock}</div>
    <table class="details">
      <tr><td class="label">Full Name</td><td class="value">${esc(member.name)}</td></tr>
      <tr><td class="label">Age</td><td class="value">${esc(member.age ?? "-")}</td></tr>
      <tr><td class="label">Gender</td><td class="value">${esc(member.gender || "-")}</td></tr>
      <tr><td class="label">Phone Number</td><td class="value">${esc(member.phoneDigits)}</td></tr>
      <tr><td class="label">Membership Tier</td><td class="value">${esc(membership.tierName)}</td></tr>
      <tr><td class="label">Start Date</td><td class="value">${formatDate(membership.startDate)}</td></tr>
      <tr><td class="label">End Date</td><td class="value">${formatDate(membership.endDate)}</td></tr>
      <tr><td class="label">Sessions Included</td><td class="value">${membership.sessions == null ? "Unlimited" : membership.sessions}</td></tr>
      <tr><td class="label">Sessions Remaining</td><td class="value">${remaining == null ? "Unlimited" : remaining}</td></tr>
      <tr><td class="label">Coaching</td><td class="value">${member.coaching ? "Yes" : "No"}</td></tr>
    </table>
  </div>

  <div class="qrWrap">
    <img src="${qrDataUri}" />
    <div class="qrCaption">Scan this QR at entry and exit</div>
  </div>

  <h2 class="section">DECLARATION</h2>
  <div style="font-size:12px;">I hereby certify that:</div>
  <ul class="decl">
    <li>I do / do not know swimming and will swim at my own risk.</li>
    <li>I have read the printed rules, regulations &amp; special instructions overleaf and hereby undertake that I will abide by them.</li>
    <li>All users of swimming facilities shall have a proper bath before entering the pool.</li>
    <li>Do not apply any lotion / cream on the body before entering the pool.</li>
    <li>No person shall keep any valuable / watch / purse / money / ornaments - at his / her own risk and responsibility.</li>
    <li>No eatables shall be brought into the swimming pool premises.</li>
  </ul>
  <div class="hindiNote">बिना आई-कार्ड स्विमिंग पूल में एन्ट्री नहीं होगी।</div>

  <h2 class="section">RULES &amp; REGULATIONS</h2>
  <ol class="rules">
    ${RULES.map((rule) => `<li>${esc(rule)}</li>`).join("\n    ")}
  </ol>

  <h2 class="section">SPECIAL INSTRUCTIONS</h2>
  <ol class="rules">
    ${SPECIAL_INSTRUCTIONS.map((rule) => `<li>${esc(rule)}</li>`).join("\n    ")}
  </ol>

  <div class="footer">
    <span>${footer}</span>
    <span>SWIMY — Powered by Swimy</span>
  </div>
</body>
</html>`;
}

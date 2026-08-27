import type { Pool } from "./firestore";

export type PricingModelId = "A" | "B" | "C" | "D";

export type PricingSlab = {
  label: string;
  startMin: number; // minutes since midnight
  endMin: number; // minutes since midnight
  price: number;
};

export type PricingConfig =
  | { model: "A"; baseCharge: number; perMinCharge: number }
  | { model: "B"; slotPrice: number; overagePerMin: number }
  | { model: "C"; slabs: PricingSlab[]; lateExitPerMin: number }
  | { model: "D" };

// New pools created via the admin catalog only carry a flat pricePerVisit -
// default them into model B so existing behavior keeps working until the
// facility sets its own pricing from the Settings tab.
export function extractPricingConfig(pool: Pool): PricingConfig {
  const model = pool.pricingModel ?? "B";
  if (model === "A") {
    return { model: "A", baseCharge: pool.baseCharge ?? 0, perMinCharge: pool.perMinCharge ?? 0 };
  }
  if (model === "C") {
    return { model: "C", slabs: pool.slabs ?? [], lateExitPerMin: pool.lateExitPerMin ?? 0 };
  }
  if (model === "D") {
    return { model: "D" };
  }
  return {
    model: "B",
    slotPrice: pool.slotPrice ?? pool.pricePerVisit,
    overagePerMin: pool.overagePerMin ?? Math.round(pool.pricePerVisit / 60),
  };
}

export type DueLine = { label: string; amount: number };

export type DueBreakdown = {
  minutes: number;
  lines: DueLine[];
  total: number;
  note: string;
};

function minuteOfDay(ms: number): number {
  const date = new Date(ms);
  return date.getHours() * 60 + date.getMinutes();
}

function slabEndTimestamp(enteredAt: number, slab: PricingSlab): number {
  const entryDate = new Date(enteredAt);
  entryDate.setHours(0, Math.min(slab.endMin, 24 * 60), 0, 0);
  return entryDate.getTime();
}

export function computeDue(config: PricingConfig, enteredAt: number, exitedAt: number, peopleCount: number = 1): DueBreakdown {
  const perPerson = computePerPersonDue(config, enteredAt, exitedAt);
  if (peopleCount <= 1) return perPerson;

  return {
    minutes: perPerson.minutes,
    lines: perPerson.lines.map((line) => ({ label: line.label, amount: line.amount * peopleCount })),
    total: perPerson.total * peopleCount,
    note: `${perPerson.note} · × ${peopleCount} people`,
  };
}

function computePerPersonDue(config: PricingConfig, enteredAt: number, exitedAt: number): DueBreakdown {
  const minutes = Math.max(0, Math.round((exitedAt - enteredAt) / 60000));

  if (config.model === "A") {
    const amount = config.perMinCharge * minutes;
    return {
      minutes,
      lines: [
        { label: "Base charge", amount: config.baseCharge },
        { label: `${minutes} min`, amount },
      ],
      total: config.baseCharge + amount,
      note: `${minutes} min at ₹${config.perMinCharge}/min`,
    };
  }

  if (config.model === "C") {
    const entryMin = minuteOfDay(enteredAt);
    const slab = config.slabs.find((s) => entryMin >= s.startMin && entryMin < s.endMin) ?? config.slabs[0] ?? null;
    if (!slab) {
      return { minutes, lines: [], total: 0, note: "No pricing slab configured for this pool." };
    }
    const lines: DueLine[] = [{ label: slab.label || "Slab charge", amount: slab.price }];
    let total = slab.price;
    const slabEnd = slabEndTimestamp(enteredAt, slab);
    if (exitedAt > slabEnd) {
      const lateMinutes = Math.max(0, Math.round((exitedAt - slabEnd) / 60000));
      const lateAmount = lateMinutes * config.lateExitPerMin;
      lines.push({ label: `${lateMinutes} min late exit`, amount: lateAmount });
      total += lateAmount;
      return { minutes, lines, total, note: `${lateMinutes} min beyond the ${slab.label || "slab"} window` };
    }
    return { minutes, lines, total, note: `Within the ${slab.label || "slab"} window` };
  }

  if (config.model === "D") {
    return { minutes, lines: [], total: 0, note: "Pricing model D is not yet supported." };
  }

  // Model B: 1-hour slot, then per-minute overage.
  if (minutes <= 60) {
    return {
      minutes,
      lines: [{ label: "1-Hour Slot", amount: config.slotPrice }],
      total: config.slotPrice,
      note: "Within 1-hour slot — no overage",
    };
  }
  const overageMinutes = minutes - 60;
  const overageAmount = overageMinutes * config.overagePerMin;
  return {
    minutes,
    lines: [
      { label: "1-Hour Slot", amount: config.slotPrice },
      { label: `${overageMinutes} extra min`, amount: overageAmount },
    ],
    total: config.slotPrice + overageAmount,
    note: `${overageMinutes} extra minute${overageMinutes > 1 ? "s" : ""} beyond the 1-hour slot`,
  };
}

"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface BillingStatus {
  tier: "free" | "pro" | "team";
  limits: { max_sources: number; max_slots: number };
  usage: { sources_count: number; slots_count: number };
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const PLANS = [
  {
    name: "Free",
    tier: "free" as const,
    price: "$0",
    period: "forever",
    features: ["1 source", "20 slots", "3 image inputs / month", "Voice & text input"],
  },
  {
    name: "Pro",
    tier: "pro" as const,
    price: "Coming soon",
    period: "",
    features: ["20 sources", "500 slots", "500 image inputs / month", "Priority routing"],
    highlighted: true,
  },
];

export function UpgradeModal({ open, onClose }: Props) {
  const { user } = useAuthStore();
  const [billing, setBilling] = useState<BillingStatus | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    api
      .get("/api/v1/billing/me")
      .then((r) => setBilling(r.data))
      .catch(() => {});
  }, [open, user]);

  const currentTier = billing?.tier ?? "free";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl bg-zinc-900 border-zinc-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Plans &amp; Billing</DialogTitle>
        </DialogHeader>

        {billing && (
          <div className="mb-4 rounded-lg bg-zinc-800 px-4 py-3 text-sm text-zinc-300 flex gap-6">
            <span>
              Sources:{" "}
              <span className="text-white font-medium">
                {billing.usage.sources_count} / {billing.limits.max_sources}
              </span>
            </span>
            <span>
              Slots:{" "}
              <span className="text-white font-medium">
                {billing.usage.slots_count} / {billing.limits.max_slots}
              </span>
            </span>
            <span>
              Plan:{" "}
              <span className="text-white font-medium capitalize">{billing.tier}</span>
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {PLANS.map((plan) => {
            const isCurrent = plan.tier === currentTier;
            return (
              <div
                key={plan.tier}
                className={`rounded-xl border p-4 flex flex-col gap-3 ${
                  plan.highlighted
                    ? "border-violet-500 bg-violet-950/30"
                    : "border-zinc-700 bg-zinc-800"
                }`}
              >
                <div>
                  <p className="font-semibold text-white">{plan.name}</p>
                  <p className="text-sm text-zinc-400 mt-0.5">
                    <span className="text-xl font-bold text-white">{plan.price}</span>
                    {plan.period && (
                      <span className="text-xs text-zinc-500 ml-1">{plan.period}</span>
                    )}
                  </p>
                </div>

                <ul className="text-xs text-zinc-400 space-y-1 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-violet-400 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <Button variant="outline" size="sm" disabled className="w-full border-zinc-600 text-zinc-400">
                    Current plan
                  </Button>
                ) : plan.tier === "free" ? (
                  <Button variant="outline" size="sm" disabled className="w-full border-zinc-600 text-zinc-400">
                    Downgrade
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                    disabled
                    title="In-app purchase available on mobile"
                  >
                    Upgrade on mobile
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-zinc-500 mt-2">
          Upgrades are purchased through the NoteRoute mobile app via in-app purchase.
        </p>
      </DialogContent>
    </Dialog>
  );
}

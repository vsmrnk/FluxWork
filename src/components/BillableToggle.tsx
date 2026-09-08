"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setEntryBillable } from "@/app/actions/time";

/** Compact toggle for a single time entry's billability. */
export function BillableToggle({
  entryId,
  projectId,
  isBillable,
}: {
  entryId: string;
  projectId: string;
  isBillable: boolean;
}) {
  const [billable, setBillable] = useState(isBillable);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    const next = !billable;
    setBillable(next); // optimistic
    startTransition(async () => {
      const res = await setEntryBillable(entryId, projectId, next);
      if (res?.error) {
        setBillable(!next); // revert
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={billable ? "Billable — click to exclude" : "Non-billable — click to include"}
      // Semantic pair from the design system: billable = green, non-billable =
      // steel. Teal is reserved for "running", so it must not appear here.
      className={`badge ${billable ? "badge-bill" : "badge-non"} cursor-pointer transition-colors disabled:opacity-50`}
    >
      <span className="dot" aria-hidden />
      {billable ? "Billable" : "Non-billable"}
    </button>
  );
}

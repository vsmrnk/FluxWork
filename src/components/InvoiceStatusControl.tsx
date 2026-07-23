"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateInvoiceStatus } from "@/app/actions/invoices";
import { Select } from "@/components/Select";

const STATUSES = ["draft", "sent", "paid", "void"] as const;

export function InvoiceStatusControl({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: string;
}) {
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onChange(next: string) {
    const prev = value;
    setValue(next);
    startTransition(async () => {
      const res = await updateInvoiceStatus(invoiceId, next);
      if (res?.error) {
        setValue(prev);
        return;
      }
      router.refresh();
    });
  }

  return (
    <label className="flex items-center gap-2">
      <span className="label">Status</span>
      <Select
        className="w-auto py-1.5"
        aria-label="Status"
        value={value}
        disabled={pending}
        onChange={onChange}
        options={STATUSES.map((s) => ({ value: s, label: s }))}
      />
    </label>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient, updateClient } from "@/app/actions/clients";
import { Modal } from "@/components/Modal";
import type { Client } from "@/lib/database.types";

type Props =
  | { mode: "create"; client?: undefined }
  | { mode: "edit"; client: Client };

export function ClientForm(props: Props) {
  const editing = props.mode === "edit";
  const [open, setOpen] = useState(editing);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = editing
        ? await updateClient(props.client.id, formData)
        : await createClient(formData);
      if (res && "error" in res) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      if (editing) {
        router.refresh();
      } else {
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      }
    });
  }

  const c = props.client;

  const formEl = (
    <form
      ref={formRef}
      action={onSubmit}
      className={
        editing
          ? "rise border border-line-strong bg-paper-2 p-5 flex flex-col gap-4 rounded-md"
          : "flex flex-col gap-4"
      }
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label block mb-2">Client name</label>
          <input
            name="name"
            required
            className="field"
            placeholder="Acme Inc."
            defaultValue={c?.name}
            autoFocus={!editing}
          />
        </div>
        <div>
          <label className="label block mb-2">Email</label>
          <input
            name="email"
            type="email"
            className="field"
            placeholder="billing@acme.com"
            defaultValue={c?.email ?? ""}
          />
        </div>
        <div>
          <label className="label block mb-2">Default rate / hour</label>
          <input
            name="default_rate"
            inputMode="decimal"
            className="field num"
            placeholder="120"
            defaultValue={c?.default_rate ?? ""}
          />
        </div>
        <div>
          <label className="label block mb-2">Currency</label>
          <input
            name="currency"
            className="field num uppercase"
            placeholder="USD"
            maxLength={3}
            defaultValue={c?.currency ?? "USD"}
          />
        </div>
        <div>
          <label className="label block mb-2">Tax label</label>
          <input
            name="tax_label"
            className="field"
            placeholder="VAT / GST (optional)"
            defaultValue={c?.tax_label ?? ""}
          />
        </div>
        <div>
          <label className="label block mb-2">Tax rate %</label>
          <input
            name="tax_rate"
            inputMode="decimal"
            className="field num"
            placeholder="0"
            defaultValue={c?.tax_rate ? String(c.tax_rate) : ""}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label block mb-2">Billing address</label>
          <textarea
            name="address"
            className="field"
            rows={3}
            placeholder="Street, City, Country"
            defaultValue={c?.address ?? ""}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label block mb-2">Notes</label>
          <input
            name="notes"
            className="field"
            placeholder="Optional"
            defaultValue={c?.notes ?? ""}
          />
        </div>
      </div>

      {error && <p className="num text-xs text-accent">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-accent">
          {pending ? "Saving…" : editing ? "Save changes" : "Create client"}
        </button>
        {!editing && (
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );

  // Edit lives inline on the client detail page; create opens in a modal so it
  // never balloons out of the header action slot it's triggered from.
  if (editing) return formEl;

  return (
    <>
      <button className="btn btn-accent" onClick={() => setOpen(true)}>
        + New client
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="New client">
        {formEl}
      </Modal>
    </>
  );
}

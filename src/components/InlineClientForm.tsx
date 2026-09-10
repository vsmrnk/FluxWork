"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClientInline } from "@/app/actions/clients";

type Props = {
  /**
   * When set, the created client is linked to this project in the same action
   * and the project page is revalidated. Omit when the caller only needs the
   * new client back (e.g. a project that doesn't exist yet — see `onCreated`).
   */
  projectId?: string;
  /**
   * Called with the new client after a successful create. Use it to select the
   * client in a parent form (ProjectForm) instead of revalidating the page.
   */
  onCreated?: (client: { id: string; name: string }) => void;
  /** Collapsed trigger label. Default "+ New client". */
  triggerLabel?: string;
  /** Trigger styling. Default "ghost". */
  variant?: "accent" | "ghost";
};

export function InlineClientForm({
  projectId,
  onCreated,
  triggerLabel = "+ New client",
  variant = "ghost",
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createClientInline(formData, projectId ?? null);
      if (res && "error" in res) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      formRef.current?.reset();
      setOpen(false);
      if (onCreated) onCreated({ id: res.id, name: res.name });
      else router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        className={variant === "accent" ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={onSubmit}
      className="rise border border-line-strong bg-paper-2 p-4 rounded-md flex flex-col gap-3"
    >
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1">
          <label className="label block mb-2">Client name</label>
          <input name="name" required className="field" placeholder="Acme Inc." autoFocus />
        </div>
        <div className="sm:col-span-1">
          <label className="label block mb-2">Email</label>
          <input name="email" type="email" className="field" placeholder="Optional" />
        </div>
        <div className="sm:col-span-1">
          <label className="label block mb-2">Rate / hour</label>
          <input
            name="default_rate"
            inputMode="decimal"
            className="field num"
            placeholder="Optional"
          />
        </div>
      </div>

      {error && <p className="num text-xs text-accent">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-accent btn-sm">
          {pending ? "Saving…" : "Add client"}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

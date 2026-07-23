"use client";

import { useRef, useState, useTransition } from "react";
import { createProject } from "@/app/actions/projects";
import { InlineClientForm } from "@/components/InlineClientForm";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";

// Distinct project-identifier hues, drawn from the design tokens so the dots
// read as part of the same palette (teal · green · blue · brass · violet · clay).
const SWATCHES = ["#0e5c63", "#176048", "#1f6feb", "#b9791f", "#7c5cff", "#c0483b"];

type ClientOption = { id: string; name: string };

export function ProjectForm({
  clients = [],
  variant = "primary",
  usageHint,
}: {
  clients?: ClientOption[];
  /** "ghost" demotes the trigger where the timer is the primary action. */
  variant?: "primary" | "ghost";
  /** Quiet counter shown under the trigger near a free-tier limit, e.g. "4 of 5 free projects". */
  usageHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(SWATCHES[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // A client created inline is added here and pre-selected, so the project can
  // be linked without leaving the form (plan §6 Flow 5).
  const [clientList, setClientList] = useState<ClientOption[]>(clients);
  const [selectedClientId, setSelectedClientId] = useState("");

  function onSubmit(formData: FormData) {
    setError(null);
    formData.set("color", color);
    startTransition(async () => {
      const res = await createProject(formData);
      if (res && "error" in res) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      formRef.current?.reset();
      setSelectedClientId("");
      setOpen(false);
    });
  }

  return (
    <div className="flex flex-col items-stretch sm:items-end gap-1.5">
      <button
        className={variant === "ghost" ? "btn btn-ghost" : "btn btn-accent"}
        onClick={() => setOpen(true)}
      >
        + New project
      </button>
      {usageHint && <p className="num text-xs text-ink-3">{usageHint}</p>}

      <Modal open={open} onClose={() => setOpen(false)} title="New project">
        <form ref={formRef} action={onSubmit} className="flex flex-col gap-4">
          <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label block mb-2">Project name</label>
            <input name="name" required className="field" placeholder="Redesign" autoFocus />
          </div>
          <div>
            <label className="label block mb-2">Client</label>
            {clientList.length === 0 ? (
              <input className="field" placeholder="No clients yet — add one below" disabled />
            ) : (
              <Select
                name="client_id"
                aria-label="Client"
                value={selectedClientId}
                onChange={setSelectedClientId}
                options={[
                  { value: "", label: "No client" },
                  ...clientList.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            )}
          </div>
          <div>
            <label className="label block mb-2">Code</label>
            <input name="code" className="field" placeholder="ACM-01" />
          </div>
          <div>
            <label className="label block mb-2">Rate / hour (override)</label>
            <input
              name="rate"
              inputMode="decimal"
              className="field num"
              placeholder="Inherits client rate"
            />
          </div>
          <div>
            <label className="label block mb-2">Color</label>
            <div className="flex items-center gap-2 h-[2.35rem]">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`color ${c}`}
                  className="h-6 w-6 border transition-transform"
                  style={{
                    background: c,
                    borderColor: color === c ? "var(--color-ink)" : "transparent",
                    transform: color === c ? "scale(1.12)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {error && <p className="num text-xs text-accent">{error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn btn-accent">
            {pending ? "Saving…" : "Create"}
          </button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </form>

          {/* Just-in-time client creation. Sibling of the form (never nested), so
              its own <form> stays valid; the new client is selected here. */}
          <div className="mt-4 pt-4 rule-t">
            <InlineClientForm
              onCreated={(c) => {
                setClientList((list) => [...list, c]);
                setSelectedClientId(c.id);
              }}
            />
          </div>
      </Modal>
    </div>
  );
}

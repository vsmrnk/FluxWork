"use client";

import Link from "next/link";
import { useState } from "react";
import { ProjectBillingForm } from "@/components/ProjectBillingForm";
import { InlineClientForm } from "@/components/InlineClientForm";

type ClientOption = { id: string; name: string };

type Props = {
  projectId: string;
  clients: ClientOption[];
  currentClientId: string | null;
  /** Project-level rate override; null means "inherit the client's rate". */
  currentRate: number | null;
  client: { id: string; name: string; email: string | null } | null;
  /** Pre-formatted on the server so this component never imports money helpers. */
  rateLabel: string;
  /** Where the effective rate comes from — override vs inherited vs unset. */
  rateSource: string;
  unbilledLabel: string | null;
  unbilledHours: string;
  taxLabel: string | null;
};

export function ClientPanel({
  projectId,
  clients,
  currentClientId,
  currentRate,
  client,
  rateLabel,
  rateSource,
  unbilledLabel,
  unbilledHours,
  taxLabel,
}: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="panel flex flex-col">
      <div className="flex items-center justify-between gap-3 p-5 pb-4">
        <span className="label">Client &amp; rate</span>
        {client && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={editing}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>

      {client ? (
        <div className="px-5 pb-5 flex flex-col gap-4">
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-tight truncate">
              {client.name}
            </p>
            {client.email ? (
              <a
                href={`mailto:${client.email}`}
                className="text-xs text-ink-2 hover:text-accent transition-colors truncate block mt-0.5"
              >
                {client.email}
              </a>
            ) : (
              <p className="text-xs text-ink-3 mt-0.5">No email on file</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4 rule-t">
            <div>
              <div className="num text-base leading-none">{rateLabel}</div>
              <div className="label mt-1.5">Rate / hour</div>
              <div className="text-[0.7rem] text-ink-3 mt-1">{rateSource}</div>
            </div>
            <div>
              <div className="num text-base leading-none text-ink-2">
                {taxLabel ?? "—"}
              </div>
              <div className="label mt-1.5">Tax</div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="mx-5 mb-5 p-4 rounded-[var(--radius)]"
          style={{
            background: "var(--brass-dim)",
            border: "1px solid var(--brass-line)",
          }}
        >
          <p className="text-sm font-semibold">No client yet</p>
          <p className="text-xs text-ink-2 mt-1">
            Time still tracks fine — but earnings and invoices need a client and
            a rate.
          </p>
        </div>
      )}

      {/* Unbilled — the bridge from tracked time to money owed. */}
      <div className="px-5 py-4 rule-t flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="label">Unbilled</div>
          <div className="num text-[0.7rem] text-ink-3 mt-1">
            {unbilledHours} h ready to invoice
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className="num text-xl leading-none"
            style={{ color: unbilledLabel ? "var(--gold)" : "var(--ink-3)" }}
          >
            {unbilledLabel ?? "—"}
          </div>
        </div>
      </div>

      <div className="px-5 pb-5 flex flex-wrap items-center gap-2">
        {client ? (
          <Link
            href={`/invoices?client=${client.id}`}
            className="btn btn-accent btn-sm flex-1 justify-center"
          >
            Create invoice →
          </Link>
        ) : (
          <InlineClientForm
            projectId={projectId}
            triggerLabel="+ Add a client"
            variant="accent"
          />
        )}
        {!client && clients.length > 0 && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Close" : "Pick existing"}
          </button>
        )}
      </div>

      {editing && (
        <div className="rise px-5 pb-5 flex flex-col gap-3">
          <ProjectBillingForm
            projectId={projectId}
            clients={clients}
            currentClientId={currentClientId}
            currentRate={currentRate}
          />
          {client && <InlineClientForm projectId={projectId} />}
        </div>
      )}
    </div>
  );
}

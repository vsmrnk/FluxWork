"use client";

import { useState, useTransition } from "react";
import { Select } from "@/components/Select";
import { BillableToggle } from "@/components/BillableToggle";
import { ConfirmAction } from "@/components/ConfirmAction";
import { deleteEntry, setEntryNotes, updateEntry } from "@/app/actions/time";

type TaskOption = { id: string; name: string };

type Props = {
  entryId: string;
  projectId: string;
  taskId: string;
  taskName: string;
  tasks: TaskOption[];
  startedAtIso: string;
  endedAtIso: string | null;
  notes: string | null;
  isBillable: boolean;
  /** Server-formatted so the list renders identically on both sides. */
  rangeLabel: string;
  durationLabel: string | null;
  amountLabel: string | null;
};

/**
 * `datetime-local` wants the viewer's wall clock, but formatting an ISO string
 * in local time during render would disagree with the server's timezone and
 * break hydration. This only ever runs from a click, well after mount.
 */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * One managed time entry. The note ("what was done") saves on its own so the
 * common case — recording what a block of time actually produced — is a single
 * click and a sentence, while corrections to the task or the clock live behind
 * an explicit Edit so a stray blur can never rewrite a timestamp.
 */
export function EntryRow({
  entryId,
  projectId,
  taskId,
  taskName,
  tasks,
  startedAtIso,
  endedAtIso,
  notes,
  isBillable,
  rangeLabel,
  durationLabel,
  amountLabel,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(notes ?? "");
  const [savedNote, setSavedNote] = useState(notes ?? "");
  const [notePending, startNote] = useTransition();
  const [formPending, startForm] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const running = endedAtIso === null;

  function commitNote() {
    const next = note.trim();
    if (next === savedNote.trim()) return;
    startNote(async () => {
      const res = await setEntryNotes(entryId, projectId, next);
      if (res?.error) {
        setError(res.error);
        setNote(savedNote);
        return;
      }
      setError(null);
      setSavedNote(next);
    });
  }

  function onSave(formData: FormData) {
    setError(null);
    startForm(async () => {
      const res = await updateEntry(entryId, projectId, formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setEditing(false);
    });
  }

  return (
    <div className="px-4 py-3 rule-b last:border-b-0 hover:bg-surface-2 transition-colors">
      <div className="grid grid-cols-12 gap-3 items-start">
        <div className="col-span-12 md:col-span-3 min-w-0">
          <p className="truncate text-sm font-semibold">{taskName}</p>
          <div className="mt-1.5">
            <BillableToggle
              entryId={entryId}
              projectId={projectId}
              isBillable={isBillable}
            />
          </div>
        </div>

        {/* "What was done" — the note is the point of this view. */}
        <div className="col-span-12 md:col-span-4 min-w-0">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={commitNote}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === "Escape") setNote(savedNote);
            }}
            disabled={notePending}
            aria-label={`What was done on ${taskName}`}
            placeholder="What did you do?"
            className="field py-1.5 text-sm"
          />
          {notePending && (
            <span className="num text-[0.65rem] text-ink-3 mt-1 block">
              Saving…
            </span>
          )}
        </div>

        <div className="col-span-7 md:col-span-3 num text-xs text-ink-2">
          <div>
            {rangeLabel}
            {running && <span className="text-accent"> running</span>}
          </div>
          <div className="text-sm text-ink mt-0.5">
            {durationLabel ?? (
              <span className="live-dot inline-block align-middle" />
            )}
          </div>
          {amountLabel && (
            <div className="text-[0.7rem] text-gold mt-0.5">{amountLabel}</div>
          )}
        </div>

        <div className="col-span-5 md:col-span-2 flex justify-end items-center gap-1">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={editing}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Close" : "Edit"}
          </button>
          <ConfirmAction
            action={deleteEntry.bind(null, entryId, projectId)}
            label="✕"
            ariaLabel={`Delete time entry on ${taskName}`}
            confirmLabel="Remove?"
            className="btn btn-ghost btn-sm"
          />
        </div>
      </div>

      {editing && (
        <form
          action={onSave}
          // Top-aligned: the End field carries helper text, so bottom-aligning
          // would push its label out of line with the other three.
          className="rise mt-3 pt-3 rule-t grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start"
        >
          <div>
            <label className="label block mb-2">Task</label>
            <Select
              name="task_id"
              required
              aria-label="Task"
              defaultValue={taskId}
              options={tasks.map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>
          <div>
            <label className="label block mb-2">Start</label>
            <input
              name="started_at"
              type="datetime-local"
              required
              defaultValue={toLocalInput(startedAtIso)}
              className="field num"
            />
          </div>
          <div>
            <label className="label block mb-2">End</label>
            <input
              name="ended_at"
              type="datetime-local"
              defaultValue={endedAtIso ? toLocalInput(endedAtIso) : ""}
              className="field num"
            />
            <p className="text-[0.65rem] text-ink-3 mt-1">
              Leave blank to keep running
            </p>
          </div>
          <div>
            <label className="label block mb-2">Note</label>
            <input
              name="notes"
              defaultValue={note}
              placeholder="What did you do?"
              className="field"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={formPending}
              className="btn btn-accent btn-sm"
            >
              {formPending ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className="num text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { addManualEntry, addTimeEntry } from "@/app/actions/time";
import { Select } from "@/components/Select";
import {
  formatDurationWords,
  parseTimeInput,
  resolveEntryTimes,
} from "@/lib/parseTimeInput";

type TaskOption = { id: string; name: string };

/** Local calendar date as YYYY-MM-DD (the smart-field's default day). */
function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function clockOf(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function shortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

/**
 * One field that reads "2h", "1:30", "45m", "1h 30m" or "9:30-11:00", shown
 * interpreted before saving. "Exact times" mode takes a start/end pair instead.
 */
export function ManualEntryForm({
  projectId,
  tasks,
  defaultTaskId,
}: {
  projectId: string;
  tasks: TaskOption[];
  /** Most recently tracked task in this project, pre-selected for quick edits. */
  defaultTaskId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"smart" | "exact">("smart");
  const [input, setInput] = useState("");
  const [today] = useState(localToday);
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Live interpretation — the same parser the server re-runs.
  const parsed = mode === "smart" && input.trim() ? parseTimeInput(input) : null;
  let previewText: string | null = null;
  if (parsed?.ok) {
    const isToday = date === today;
    const { started, ended } = resolveEntryTimes(parsed, date, isToday);
    const day = isToday ? "today" : shortDate(date);
    previewText = `${formatDurationWords(parsed.seconds)} · ${clockOf(started)}–${clockOf(ended)} ${day}`;
  }

  function reset() {
    formRef.current?.reset();
    setInput("");
    setDate(today);
    setError(null);
  }

  function onSubmit(formData: FormData) {
    setError(null);
    if (mode === "smart") {
      const result = parseTimeInput(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
    }
    startTransition(async () => {
      const res =
        mode === "smart"
          ? await addTimeEntry(projectId, formData)
          : await addManualEntry(projectId, formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      reset();
      setOpen(false);
    });
  }

  if (tasks.length === 0) return null;

  if (!open) {
    return (
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        Add time
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={onSubmit}
      className="rise border border-line-strong bg-paper-2 p-5 rounded-md flex flex-col gap-4"
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label block mb-2">Task</label>
          <Select
            name="task_id"
            aria-label="Task"
            defaultValue={defaultTaskId ?? ""}
            placeholder="Select a task…"
            options={tasks.map((t) => ({ value: t.id, label: t.name }))}
          />
        </div>

        {mode === "smart" ? (
          <>
            <input type="hidden" name="today" value={today} />
            <div>
              <label className="label block mb-2">Time</label>
              <input
                name="input"
                className="field num"
                placeholder="2h · 1:30 · 9:30-11:00"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
                autoComplete="off"
              />
            </div>
            <div>
              <label className="label block mb-2">Date</label>
              <input
                name="date"
                type="date"
                className="field num"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2 min-h-[1.25rem]">
              {previewText && (
                <p className="num text-xs text-ink-2">{previewText}</p>
              )}
              {parsed && !parsed.ok && (
                <p className="num text-xs text-ink-3">{parsed.error}</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="label block mb-2">Start</label>
              <input name="started_at" type="datetime-local" required className="field" />
            </div>
            <div>
              <label className="label block mb-2">End</label>
              <input name="ended_at" type="datetime-local" required className="field" />
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <label className="label block mb-2">Notes</label>
          <input name="notes" className="field" placeholder="Optional" />
        </div>
      </div>

      {error && <p className="num text-xs text-accent">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-accent">
          {pending ? "Saving…" : "Add time"}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm ml-auto"
          onClick={() => {
            setMode((m) => (m === "smart" ? "exact" : "smart"));
            setError(null);
          }}
        >
          {mode === "smart" ? "Use exact times" : "Use quick entry"}
        </button>
      </div>
    </form>
  );
}

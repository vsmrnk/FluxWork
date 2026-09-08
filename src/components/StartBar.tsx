"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  quickStart,
  startTimer,
  stopTimer,
  switchTimer,
} from "@/app/actions/time";
import { formatDuration, elapsedSeconds } from "@/lib/time";
import { formatMoney } from "@/lib/invoice";
import { Select } from "@/components/Select";

export type RunningEntry = {
  entryId: string;
  projectId: string;
  taskName: string;
  projectName: string;
  clientName: string | null;
  startedAt: string;
  isBillable: boolean;
  rate: number | null;
  currency: string;
};

export type PickerTask = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  projectColor: string;
};

export type PickerProject = { id: string; name: string; color: string };

export type PickerData = {
  /** Last ~7 distinct tasks by most recent entry — the one-tap resume list. */
  recent: PickerTask[];
  /** Every task in a non-archived project; filtered client-side (scale is small). */
  tasks: PickerTask[];
  projects: PickerProject[];
  /** Preselected project for inline create — the most recently tracked one. */
  defaultProjectId: string | null;
};

type ActionResult = { error?: string } | { ok: true } | void;

/**
 * The Start bar — the timer as a control, never a status display (plan §5).
 * Idle it is one big "Start working on…" button; running it keeps the live
 * duration/earnings dock. Both states open the same quick-picker (Ctrl/⌘K),
 * and the mobile bottom tab bar's center button drives the same state.
 */
export function StartBar({
  running,
  picker,
}: {
  running: RunningEntry | null;
  picker: PickerData;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Starts at 0 on both server and client so the first paint matches — seeding
  // this from the clock instead would hydrate a second later than it rendered
  // and throw a hydration mismatch. The effect fills in the real elapsed time
  // immediately after mount, and again whenever the running entry changes.
  const [live, setLive] = useState(0);

  useEffect(() => {
    if (!running) return;
    const tick = () => setLive(elapsedSeconds(running.startedAt));
    // First correction runs on the next frame rather than inline, so the
    // effect body never sets state synchronously. `live` is only read inside
    // the running branch, so a stale value from a previous run can't render.
    const frame = requestAnimationFrame(tick);
    const id = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(id);
    };
  }, [running]);

  // Ctrl/⌘K toggles the picker from anywhere in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function close() {
    setOpen(false);
    setError(null);
  }

  /** Run a timer action; keep the picker open only when it errors. */
  function run(fn: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
    });
  }

  const pickTask = (task: PickerTask) =>
    run(() =>
      running
        ? switchTimer(running.entryId, task.id, task.projectId)
        : startTimer(task.id, task.projectId, "start_bar"),
    );

  const createAndStart = (text: string, projectId: string | null) =>
    run(() =>
      quickStart(text, projectId, {
        stopEntryId: running?.entryId ?? null,
        source: "start_bar",
      }),
    );

  const stop = () => {
    if (!running) return;
    run(() => stopTimer(running.entryId, running.projectId));
  };

  const accrued =
    running && running.isBillable && running.rate
      ? formatMoney((live / 3600) * running.rate, running.currency)
      : null;

  return (
    <>
      <div className="sticky top-14 md:top-0 z-30 backdrop-blur-sm">
        {running ? (
          <div className="timerbar">
            <span className="live-dot shrink-0" aria-hidden />
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="startbar-switch group"
              aria-haspopup="dialog"
              aria-expanded={open}
              title="Switch task"
            >
              <span className="block text-sm font-semibold truncate text-on-dark group-hover:text-d-teal transition-colors">
                {running.taskName}
              </span>
              <span className="block text-[0.7rem] text-on-dark/60 truncate">
                {running.projectName}
                {running.clientName ? ` · ${running.clientName}` : ""}
                <span className="text-on-dark/40 group-hover:text-d-teal transition-colors">
                  {" "}
                  · switch
                </span>
              </span>
            </button>

            <div className="ml-auto flex items-center gap-4">
              <div className="text-right">
                <div
                  className="num text-xl md:text-2xl text-on-dark leading-none"
                  aria-live="polite"
                >
                  {formatDuration(live)}
                </div>
                <div className="num text-[0.7rem] mt-1">
                  {accrued ? (
                    <span className="text-d-brass">+{accrued} · billable</span>
                  ) : (
                    <span className="text-on-dark/50">non-billable</span>
                  )}
                </div>
              </div>
              <button
                onClick={stop}
                disabled={pending}
                className="btn btn-teal btn-sm shrink-0"
              >
                <span className="inline-block h-2 w-2 bg-current" aria-hidden />
                {pending ? "…" : "Stop"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="timerbar timerbar-idle startbar-open"
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <span className="startbar-play" aria-hidden>
              ▶
            </span>
            <span className="text-sm font-semibold">Start working on…</span>
            <span className="ml-auto hidden md:inline-flex kbd">Ctrl/⌘ K</span>
          </button>
        )}
      </div>

      {open && (
        <QuickPicker
          picker={picker}
          switching={!!running}
          pending={pending}
          error={error}
          onClose={close}
          onPick={pickTask}
          onCreate={createAndStart}
        />
      )}

      <MobileTabs
        running={!!running}
        pending={pending}
        onOpen={() => setOpen(true)}
        onStop={stop}
      />
    </>
  );
}

function QuickPicker({
  picker,
  switching,
  pending,
  error,
  onClose,
  onPick,
  onCreate,
}: {
  picker: PickerData;
  switching: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onPick: (task: PickerTask) => void;
  onCreate: (text: string, projectId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState(picker.defaultProjectId ?? "");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return picker.recent;
    return picker.tasks
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.projectName.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [q, picker]);

  const showCreate = q.length > 0 && results.length === 0;
  const count = showCreate ? 1 : results.length;
  const activeIdx = Math.min(active, Math.max(0, count - 1));

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, count - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (pending) return;
      if (showCreate) onCreate(query.trim(), projectId || null);
      else if (results[activeIdx]) onPick(results[activeIdx]);
    }
  }

  return (
    <div
      className="qp-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="qp"
        role="dialog"
        aria-modal="true"
        aria-label="Start a timer"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <input
          ref={inputRef}
          className="qp-input"
          placeholder="Search tasks, or type something new…"
          aria-label="Search tasks, or type something new"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onInputKeyDown}
        />

        <div className="qp-body">
          {switching && (
            <p className="qp-note">Picking a task stops the current one.</p>
          )}

          {results.length > 0 && (
            <div className="qp-label label">{q ? "Tasks" : "Recent"}</div>
          )}

          {results.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className="qp-item"
              data-active={i === activeIdx}
              disabled={pending}
              onMouseEnter={() => setActive(i)}
              onClick={() => onPick(t)}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-[3px] shrink-0"
                style={{ background: t.projectColor }}
              />
              <span className="truncate text-sm font-semibold">{t.name}</span>
              <span className="ml-auto text-xs text-ink-3 truncate shrink-0 max-w-[40%]">
                {t.projectName}
              </span>
            </button>
          ))}

          {!q && results.length === 0 && (
            <p className="qp-empty">
              Type what you&rsquo;re working on to start.
            </p>
          )}

          {showCreate && (
            <div className="qp-create">
              <div className="text-sm font-semibold truncate">
                Start &ldquo;{query.trim()}&rdquo;
              </div>
              <div className="qp-create-row">
                <Select
                  aria-label="Project"
                  value={projectId}
                  onChange={setProjectId}
                  options={[
                    ...picker.projects.map((p) => ({ value: p.id, label: p.name })),
                    { value: "", label: "New project" },
                  ]}
                />
                <button
                  type="button"
                  className="btn btn-accent btn-sm shrink-0"
                  disabled={pending}
                  onClick={() => onCreate(query.trim(), projectId || null)}
                >
                  {pending ? "Starting…" : "Start"}
                </button>
              </div>
            </div>
          )}

          {error && <p className="qp-error num text-xs">{error}</p>}
        </div>

        <div className="qp-foot">
          <span className="kbd">↑↓</span> choose
          <span className="kbd">↵</span> start
          <span className="kbd">esc</span> close
        </div>
      </div>
    </div>
  );
}

/**
 * Fixed bottom tabs on small screens with a raised center Start/Stop —
 * the daily loop kept thumb-reachable (plan F7). Rendered outside the
 * backdrop-blur wrapper so position:fixed stays viewport-relative.
 */
function MobileTabs({
  running,
  pending,
  onOpen,
  onStop,
}: {
  running: boolean;
  pending: boolean;
  onOpen: () => void;
  onStop: () => void;
}) {
  const path = usePathname();

  return (
    <nav className="tabbar md:hidden" aria-label="Primary">
      <TabLink href="/" label="Today" active={path === "/"} />
      <TabLink
        href="/invoices"
        label="Invoices"
        active={path.startsWith("/invoices")}
      />
      <button
        type="button"
        className="tab-start"
        data-running={running}
        disabled={pending}
        onClick={running ? onStop : onOpen}
        aria-label={running ? "Stop timer" : "Start a timer"}
      >
        {running ? (
          <span className="tab-stop-glyph" aria-hidden />
        ) : (
          <span aria-hidden>▶</span>
        )}
      </button>
      <TabLink
        href="/more"
        label="More"
        active={path.startsWith("/more")}
      />
    </nav>
  );
}

function TabLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link href={href} className="tab-item" data-active={active}>
      <span aria-hidden className="tab-dot" />
      {label}
    </Link>
  );
}

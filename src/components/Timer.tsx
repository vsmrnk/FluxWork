"use client";

import { useEffect, useState, useTransition } from "react";
import { startTimer, stopTimer } from "@/app/actions/time";
import { formatDuration, elapsedSeconds } from "@/lib/time";

type Props = {
  taskId: string;
  projectId: string;
  /** Running entry for this task, if one exists. */
  running: { id: string; started_at: string } | null;
  /** Completed seconds already logged against this task. */
  loggedSeconds: number;
};

function PlayGlyph() {
  return (
    <svg width="9" height="10" viewBox="0 0 9 10" aria-hidden focusable="false">
      <path d="M0 0.5 L9 5 L0 9.5 Z" fill="currentColor" />
    </svg>
  );
}

export function Timer({ taskId, projectId, running, loggedSeconds }: Props) {
  const [pending, startTransition] = useTransition();
  // Starts at 0 on both server and client so the first paint matches — seeding
  // this from the clock instead would hydrate a second later than it rendered
  // and throw a hydration mismatch. The effect fills in the real elapsed time
  // immediately after mount, and again whenever the running entry changes.
  const [live, setLive] = useState(0);

  useEffect(() => {
    if (!running) return;
    const tick = () => setLive(elapsedSeconds(running.started_at));
    // First correction runs on the next frame rather than inline, so the
    // effect body never sets state synchronously. `displaySeconds` ignores
    // `live` while idle, so a stale value from a previous run can't render.
    const frame = requestAnimationFrame(tick);
    const id = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(id);
    };
  }, [running]);

  const displaySeconds = loggedSeconds + (running ? live : 0);

  function onStart() {
    startTransition(async () => {
      await startTimer(taskId, projectId);
    });
  }
  function onStop() {
    if (!running) return;
    startTransition(async () => {
      await stopTimer(running.id, projectId);
    });
  }

  return (
    <div className="flex items-center gap-2.5">
      <span
        className="timer-read num"
        data-running={running ? "true" : "false"}
        aria-live="polite"
        title={
          running ? "Tracking now — total on this task" : "Total tracked on this task"
        }
      >
        {running && <i className="live-dot shrink-0" aria-hidden />}
        {formatDuration(displaySeconds)}
      </span>

      {running ? (
        <button
          onClick={onStop}
          disabled={pending}
          className="btn btn-accent btn-timer"
          aria-label="Stop timer"
        >
          <i className="stop-glyph" aria-hidden />
          {pending ? "…" : "Stop"}
        </button>
      ) : (
        <button
          onClick={onStart}
          disabled={pending}
          className="btn btn-timer btn-timer-start"
          aria-label="Start timer"
        >
          <PlayGlyph />
          {pending ? "…" : "Start"}
        </button>
      )}
    </div>
  );
}

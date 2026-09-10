"use client";

import { useRef, useState, useTransition } from "react";
import { Timer } from "@/components/Timer";
import { ConfirmAction } from "@/components/ConfirmAction";
import {
  createSubtask,
  deleteTask,
  renameTask,
  setTaskBillable,
} from "@/app/actions/tasks";
import { formatHours } from "@/lib/time";

export type TaskNode = {
  id: string;
  name: string;
  isBillable: boolean;
  running: { id: string; started_at: string } | null;
  loggedSeconds: number;
  children: TaskNode[];
};

const INDENT = 1.5; // rem per level

function Row({
  node,
  depth,
  projectId,
  canAddSubtasks,
  manage,
}: {
  node: TaskNode;
  depth: number;
  projectId: string;
  // Pro-only; existing subtasks still render for everyone.
  canAddSubtasks: boolean;
  /** Management view: expose rename. The overview board stays read-mostly. */
  manage: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [renamePending, startRename] = useTransition();
  const [billable, setBillable] = useState(node.isBillable);
  const [billablePending, startBillable] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const isRunning = node.running !== null;

  function rename(formData: FormData) {
    setError(null);
    startRename(async () => {
      const res = await renameTask(node.id, projectId, formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setRenaming(false);
    });
  }

  function toggleBillable() {
    const next = !billable;
    setBillable(next);
    startBillable(async () => {
      const res = await setTaskBillable(node.id, projectId, next);
      if (res?.error) setBillable(!next);
    });
  }

  function addSubtask(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createSubtask(projectId, node.id, formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      formRef.current?.reset();
      setAdding(false);
    });
  }

  return (
    <>
      <div className="taskrow rule-b" data-running={isRunning ? "true" : "false"}>
        <div
          className="flex items-center gap-3 min-w-0"
          style={{ paddingLeft: `${depth * INDENT}rem` }}
        >
          {depth > 0 && (
            <span className="h-px w-3 -ml-1 bg-line-strong shrink-0" aria-hidden />
          )}
          <span
            className="shrink-0"
            aria-hidden
            style={
              depth === 0
                ? {
                    height: 7,
                    width: 7,
                    borderRadius: 2,
                    background: isRunning
                      ? "var(--color-accent)"
                      : "var(--color-ink)",
                  }
                : {
                    height: 7,
                    width: 7,
                    borderRadius: 9999,
                    border: "1px solid var(--color-ink-3)",
                  }
            }
          />
          <div className="min-w-0">
            {renaming ? (
              <form action={rename} className="flex items-center gap-2">
                <input
                  name="name"
                  defaultValue={node.name}
                  autoFocus
                  required
                  aria-label="Task name"
                  className="field py-1 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setRenaming(false);
                  }}
                />
                <button
                  type="submit"
                  disabled={renamePending}
                  className="btn btn-accent btn-sm px-3"
                >
                  {renamePending ? "…" : "Save"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm px-3"
                  onClick={() => {
                    setRenaming(false);
                    setError(null);
                  }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <p className="truncate text-sm font-semibold leading-tight">
                  {node.name}
                </p>
                {/* Always present so every row keeps the same height and the
                    readouts on the right stay in a clean column. */}
                <p
                  className="text-[0.7rem] leading-tight mt-1 num"
                  style={{
                    color: isRunning
                      ? "var(--color-accent)"
                      : "var(--color-ink-3)",
                  }}
                >
                  {isRunning
                    ? "Tracking now"
                    : `${formatHours(node.loggedSeconds)} h tracked`}
                </p>
              </>
            )}
            {error && (
              <p className="num text-xs text-danger mt-1">{error}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleBillable}
            disabled={billablePending}
            title={
              billable
                ? "Billable — new entries bill by default"
                : "Non-billable — new entries won't bill"
            }
            className={`badge ${billable ? "badge-bill" : "badge-non"} cursor-pointer transition-colors disabled:opacity-50`}
          >
            <span className="dot" aria-hidden />
            <span className="hidden sm:inline">
              {billable ? "Billable" : "Non-billable"}
            </span>
          </button>

          <Timer
            taskId={node.id}
            projectId={projectId}
            running={node.running}
            loggedSeconds={node.loggedSeconds}
          />

          {manage && !renaming && (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="btn btn-ghost btn-sm"
              aria-label={`Rename task ${node.name}`}
              title="Rename task"
            >
              Rename
            </button>
          )}
          {canAddSubtasks && (
            <button
              onClick={() => setAdding((v) => !v)}
              className="btn btn-ghost btn-sm"
              aria-label={`Add subtask under ${node.name}`}
              title="Add a subtask"
            >
              ＋
            </button>
          )}
          <ConfirmAction
            action={deleteTask.bind(null, node.id, projectId)}
            label="✕"
            ariaLabel={`Delete task ${node.name}`}
            confirmLabel="Delete?"
            className="btn btn-ghost btn-sm"
          />
        </div>
      </div>

      {canAddSubtasks && adding && (
        <div
          className="rule-b py-2 pr-4 bg-surface-2"
          style={{ paddingLeft: `${1 + (depth + 1) * INDENT}rem` }}
        >
          <form
            ref={formRef}
            action={addSubtask}
            className="flex items-center gap-2"
          >
            <span className="text-ink-3 shrink-0" aria-hidden>
              ↳
            </span>
            <input
              name="name"
              autoFocus
              required
              placeholder="Subtask…"
              className="field flex-1 py-1.5"
            />
            <button
              type="submit"
              disabled={pending}
              className="btn btn-accent btn-sm px-3"
            >
              {pending ? "…" : "Add"}
            </button>
            <button
              type="button"
              className="btn btn-sm px-3"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Cancel
            </button>
            {error && <span className="num text-xs text-danger">{error}</span>}
          </form>
        </div>
      )}

      {node.children.map((child) => (
        <Row
          key={child.id}
          node={child}
          depth={depth + 1}
          projectId={projectId}
          canAddSubtasks={canAddSubtasks}
          manage={manage}
        />
      ))}
    </>
  );
}

export function TaskTree({
  projectId,
  nodes,
  canAddSubtasks = false,
  manage = false,
}: {
  projectId: string;
  nodes: TaskNode[];
  /** Pro plans get the "+ Subtask" affordance; free plans never see it. */
  canAddSubtasks?: boolean;
  /** Management view: expose rename alongside the timer controls. */
  manage?: boolean;
}) {
  if (nodes.length === 0) return null;
  return (
    // Rows render as fragments, so every .taskrow is a direct child here and
    // the last one can drop its rule against the panel edge.
    <div className="[&>.taskrow:last-child]:border-b-0">
      {nodes.map((n) => (
        <Row
          key={n.id}
          node={n}
          depth={0}
          projectId={projectId}
          canAddSubtasks={canAddSubtasks}
          manage={manage}
        />
      ))}
    </div>
  );
}

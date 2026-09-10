import Link from "next/link";
import { TaskForm } from "@/components/TaskForm";
import { TaskTree } from "@/components/TaskTree";
import { getTaskTree } from "../data";

export async function TasksPanel({
  projectId,
  canUseAdvanced,
}: {
  projectId: string;
  canUseAdvanced: boolean;
}) {
  const { tasks, tree, runningCount } = await getTaskTree(projectId);

  return (
    <>
      <div className="panel p-5">
        <h2 className="panel-title mb-1">Add a task</h2>
        <p className="text-sm text-ink-2 mb-4">
          Tasks are what you track time against — one per piece of work.
        </p>
        <TaskForm projectId={projectId} />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="panel-title">All tasks</h2>
            <span className="num text-xs text-ink-3">{tasks.length}</span>
          </div>
          {runningCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-accent font-semibold">
              <i className="live-dot" aria-hidden />
              {runningCount === 1
                ? "1 timer running"
                : `${runningCount} timers running`}
            </span>
          )}
        </div>

        {tree.length === 0 ? (
          <div className="panel py-12 px-6 text-center">
            <p className="font-medium mb-1">No tasks yet</p>
            <p className="text-sm text-ink-2">
              Add one above to start tracking time against it.
            </p>
          </div>
        ) : (
          <div className="panel overflow-hidden">
            <TaskTree
              projectId={projectId}
              nodes={tree}
              canAddSubtasks={canUseAdvanced}
              manage
            />
          </div>
        )}

        {!canUseAdvanced && tree.length > 0 && (
          <p className="text-[0.7rem] text-ink-3">
            Subtasks are a Pro feature —{" "}
            <Link href="/plan" className="text-accent hover:underline">
              see the Plan page
            </Link>
            .
          </p>
        )}
      </section>
    </>
  );
}

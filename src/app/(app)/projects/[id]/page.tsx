import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectOverflowMenu } from "@/components/ProjectOverflowMenu";
import { ProjectTabs, type ProjectView } from "@/components/ProjectTabs";
import { OverviewPanel } from "./panels/OverviewPanel";
import { TasksPanel } from "./panels/TasksPanel";
import { TimePanel } from "./panels/TimePanel";
import { getTaskTree } from "./data";
import { formatMoney } from "@/lib/invoice";
import { getPlan } from "@/lib/plan";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  // The tab lives in the URL so a refresh or a shared link reopens it.
  const defaultView: ProjectView =
    view === "tasks" || view === "time" ? view : "overview";

  const supabase = await createClient();

  const [{ data: project }, { data: clients }, plan, taskTree, { count: entryCount }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("*, clients(id, name, email, default_rate, currency, tax_label, tax_rate)")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("clients")
        .select("id, name")
        .eq("is_archived", false)
        .order("name", { ascending: true }),
      getPlan(supabase),
      getTaskTree(id),
      supabase
        .from("time_entries")
        .select("id, tasks!inner(project_id)", { count: "exact", head: true })
        .eq("tasks.project_id", id),
    ]);
  if (!project) notFound();

  const linkedClient = project.clients;
  // Project override, then the client default, then nothing.
  const effectiveRate = project.rate ?? linkedClient?.default_rate ?? null;
  const currency = linkedClient?.currency ?? "USD";
  const { runningCount } = taskTree;

  return (
    <div className="page">
      <nav className="flex items-center gap-2 text-sm text-ink-3">
        <Link href="/" className="hover:text-ink transition-colors">
          Today
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-2 truncate">{project.name}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className="mt-1.5 h-3.5 w-3.5 rounded-[3px] shrink-0"
            style={{ background: project.color }}
            aria-hidden
          />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight truncate">
              {project.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
              <p className="text-sm text-ink-2">
                {[
                  linkedClient?.name ?? project.client,
                  project.code,
                  effectiveRate != null
                    ? `${formatMoney(effectiveRate, currency)}/h`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "No client set"}
              </p>
              {runningCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs text-accent font-semibold">
                  <i className="live-dot" aria-hidden />
                  {runningCount === 1
                    ? "Timer running"
                    : `${runningCount} timers running`}
                </span>
              )}
              {project.is_archived && (
                <span className="badge badge-non">Archived</span>
              )}
            </div>
          </div>
        </div>
        <ProjectOverflowMenu projectId={id} isArchived={project.is_archived} />
      </header>

      <ProjectTabs
        defaultView={defaultView}
        counts={{ tasks: taskTree.tasks.length, time: entryCount ?? 0 }}
        overview={
          <OverviewPanel
            projectId={id}
            project={project}
            client={linkedClient}
            clients={clients ?? []}
            effectiveRate={effectiveRate}
            currency={currency}
            canUseAdvanced={plan.canUseAdvanced}
          />
        }
        tasks={
          <TasksPanel projectId={id} canUseAdvanced={plan.canUseAdvanced} />
        }
        time={
          <TimePanel
            projectId={id}
            effectiveRate={effectiveRate}
            currency={currency}
          />
        }
      />
    </div>
  );
}

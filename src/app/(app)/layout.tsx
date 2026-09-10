import { Sidebar, MobileBar } from "@/components/Sidebar";
import {
  StartBar,
  type PickerData,
  type PickerTask,
  type RunningEntry,
} from "@/components/StartBar";
import { createClient, type Supabase } from "@/lib/supabase/server";

async function getRunningEntry(supabase: Supabase): Promise<RunningEntry | null> {
  const { data } = await supabase
    .from("time_entries")
    .select(
      "id, started_at, is_billable, tasks!inner(name, projects!inner(id, name, rate, clients(name, default_rate, currency)))",
    )
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const project = data.tasks.projects;
  const client = project.clients;
  return {
    entryId: data.id,
    projectId: project.id,
    taskName: data.tasks.name,
    projectName: project.name,
    clientName: client?.name ?? null,
    startedAt: data.started_at,
    isBillable: data.is_billable,
    rate: project.rate ?? client?.default_rate ?? null,
    currency: client?.currency ?? "USD",
  };
}

/** Preloads the quick-picker: recents, all active tasks, projects. Scale is small. */
async function getPickerData(supabase: Supabase): Promise<PickerData> {
  const [{ data: recentEntries }, { data: tasks }, { data: projects }] =
    await Promise.all([
      supabase
        .from("time_entries")
        .select("task_id")
        .order("started_at", { ascending: false })
        .limit(80),
      supabase
        .from("tasks")
        .select("id, name, projects!inner(id, name, color, is_archived)")
        .eq("projects.is_archived", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("projects")
        .select("id, name, color")
        .eq("is_archived", false)
        .order("created_at", { ascending: false }),
    ]);

  const allTasks: PickerTask[] = (tasks ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    projectId: t.projects.id,
    projectName: t.projects.name,
    projectColor: t.projects.color,
  }));
  const taskById = new Map(allTasks.map((t) => [t.id, t]));

  // Last 7 distinct tasks; archived projects drop out because their tasks
  // aren't in taskById.
  const recent: PickerTask[] = [];
  const seen = new Set<string>();
  for (const e of recentEntries ?? []) {
    if (seen.has(e.task_id)) continue;
    seen.add(e.task_id);
    const task = taskById.get(e.task_id);
    if (!task) continue;
    recent.push(task);
    if (recent.length >= 7) break;
  }

  return {
    recent,
    tasks: allTasks,
    projects: projects ?? [],
    defaultProjectId: recent[0]?.projectId ?? projects?.[0]?.id ?? null,
  };
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const [running, picker] = await Promise.all([
    getRunningEntry(supabase),
    getPickerData(supabase),
  ]);

  return (
    <div className="md:grid md:grid-cols-[236px_1fr] md:items-start">
      <Sidebar projects={picker.projects} />
      {/* Bottom padding keeps the mobile tab bar from covering content. */}
      <div className="min-w-0 pb-[calc(5rem_+_env(safe-area-inset-bottom))] md:pb-0">
        <MobileBar />
        <StartBar running={running} picker={picker} />
        {children}
      </div>
    </div>
  );
}

"use client";

import { useRef, useState, type ReactNode } from "react";

export type ProjectView = "overview" | "tasks" | "time";

const TABS: { id: ProjectView; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
  { id: "time", label: "Time" },
];

/**
 * Single-page view switcher for the project workspace. Each panel is rendered
 * on the server and handed in as a prop, so switching is instant — no refetch,
 * no route change, and server-action revalidation keeps every panel fresh
 * without resetting the selected tab.
 *
 * The choice is mirrored into `?view=` with replaceState so a refresh or a
 * shared link lands on the same panel, while never pushing a history entry
 * that would make Back feel broken.
 */
export function ProjectTabs({
  defaultView,
  counts,
  overview,
  tasks,
  time,
}: {
  defaultView: ProjectView;
  counts: Partial<Record<ProjectView, number>>;
  overview: ReactNode;
  tasks: ReactNode;
  time: ReactNode;
}) {
  const [view, setView] = useState<ProjectView>(defaultView);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function select(next: ProjectView) {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
  }

  // Roving arrow-key navigation, per the WAI-ARIA tabs pattern.
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const delta =
      e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + TABS.length) % TABS.length;
    select(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <>
      <div role="tablist" aria-label="Project views" className="tabs">
        {TABS.map((tab, i) => {
          const active = view === tab.id;
          const count = counts[tab.id];
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`project-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`project-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              data-active={active}
              onClick={() => select(tab.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className="tab"
            >
              {tab.label}
              {count != null && <span className="tab-count num">{count}</span>}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`project-panel-${view}`}
        aria-labelledby={`project-tab-${view}`}
        tabIndex={0}
        className="flex flex-col gap-4 focus-visible:outline-none"
      >
        {/* One lookup, one child — three sibling `&&` expressions would make
            React treat the panels as an unkeyed list. */}
        {({ overview, tasks, time } as Record<ProjectView, ReactNode>)[view]}
      </div>
    </>
  );
}

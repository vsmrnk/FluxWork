"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmAction } from "@/components/ConfirmAction";
import { setProjectArchived, deleteProject } from "@/app/actions/projects";

export function ProjectOverflowMenu({
  projectId,
  isArchived,
}: {
  projectId: string;
  isArchived: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrap = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function archive() {
    startTransition(async () => {
      await setProjectArchived(projectId, !isArchived);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        className="btn btn-ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Project actions"
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>

      {open && (
        <div
          role="menu"
          className="rise panel absolute right-0 mt-2 w-56 p-1.5 z-30 flex flex-col gap-0.5"
        >
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={archive}
            className="btn btn-ghost btn-sm w-full justify-start"
          >
            {isArchived ? "Unarchive project" : "Archive project"}
          </button>
          <div className="rule-t my-1" />
          <ConfirmAction
            action={deleteProject.bind(null, projectId)}
            label="Delete project"
            confirmLabel="Delete everything?"
            className="btn btn-danger btn-sm w-full justify-start"
          />
          <p className="text-[0.7rem] text-ink-3 px-2 pt-1 pb-1.5">
            Deleting removes the project&apos;s tasks and tracked time.
          </p>
        </div>
      )}
    </div>
  );
}

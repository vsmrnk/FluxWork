"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { id: string; name: string; color: string };

/** Solid-square nav dot shared by the primary and Manage clusters. */
function Dot() {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
      style={{ background: "var(--color-ink-3)" }}
    />
  );
}

export function SidebarNav({ projects }: { projects: Item[] }) {
  const path = usePathname();

  // Clients and Plan are configuration, so they sit in a separate Manage cluster.
  const primary = [
    { href: "/", label: "Today" },
    { href: "/reports", label: "Reports" },
    { href: "/invoices", label: "Invoices" },
  ];
  const manage = [
    { href: "/clients", label: "Clients" },
    { href: "/plan", label: "Plan" },
  ];

  const isActive = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);

  return (
    <nav className="flex flex-col gap-0.5">
      {primary.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="nav-item"
          data-active={isActive(l.href)}
        >
          <Dot />
          {l.label}
        </Link>
      ))}

      <div className="flex items-center justify-between px-2 pt-6 pb-2">
        <span className="label text-ink-3">Projects</span>
      </div>

      {projects.length === 0 ? (
        <p className="px-2 text-sm text-ink-3">No projects yet</p>
      ) : (
        projects.map((p) => {
          const href = `/projects/${p.id}`;
          return (
            <Link
              key={p.id}
              href={href}
              className="nav-item"
              data-active={path === href}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ background: p.color }}
              />
              <span className="truncate">{p.name}</span>
            </Link>
          );
        })
      )}

      <div className="mt-6 pt-3 border-t border-line flex flex-col gap-0.5">
        <span className="label text-ink-3 px-2 pb-1">Manage</span>
        {manage.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="nav-item"
            data-active={isActive(l.href)}
          >
            <Dot />
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

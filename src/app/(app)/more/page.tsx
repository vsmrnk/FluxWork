import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { setDigestOptOut } from "@/app/actions/digest";
import { createClient } from "@/lib/supabase/server";

/**
 * Mobile-only catch-all for the demoted destinations (plan §5). Reports, Clients
 * and Plan live here instead of the tab bar; sign-out reuses the same action the
 * sidebar footer does. Desktop reaches these straight from the sidebar.
 */
const links = [
  { href: "/reports", label: "Reports", hint: "Earned, tracked and unbilled by range" },
  { href: "/clients", label: "Clients", hint: "Who you bill, and their rates" },
  { href: "/plan", label: "Plan", hint: "Your subscription and limits" },
];

export default async function MorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Default on: only an explicit `true` opts the user out.
  const digestOn = user?.user_metadata?.digest_opt_out !== true;

  return (
    <div className="page page-doc">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">More</h1>
        <p className="text-sm text-ink-2 mt-1">Settings and account.</p>
      </div>

      <div className="panel overflow-hidden">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="flex items-center justify-between gap-4 px-5 py-4 rule-b last:border-b-0 hover:bg-surface-2 transition-colors"
          >
            <span className="flex flex-col min-w-0">
              <span className="font-medium">{l.label}</span>
              <span className="text-xs text-ink-3 truncate">{l.hint}</span>
            </span>
            <span aria-hidden className="text-ink-3">
              →
            </span>
          </Link>
        ))}
      </div>

      {/* Weekly digest opt-out (UX rework §2). Default on. */}
      <div className="panel p-5 flex items-center justify-between gap-4">
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="font-medium">Weekly digest</span>
          <span className="text-xs text-ink-3">
            A once-a-week email with what you earned, tracked, and still have unbilled.
          </span>
        </span>
        <form action={setDigestOptOut} className="shrink-0">
          <input type="hidden" name="optOut" value={digestOn ? "true" : ""} />
          <button
            type="submit"
            role="switch"
            aria-checked={digestOn}
            aria-label="Weekly digest"
            className={digestOn ? "btn btn-accent btn-sm" : "btn btn-sm"}
          >
            {digestOn ? "On" : "Off"}
          </button>
        </form>
      </div>

      <form action={signOut}>
        <button type="submit" className="btn btn-ghost w-full justify-start">
          Sign out
        </button>
      </form>
    </div>
  );
}

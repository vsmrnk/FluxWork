import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClientForm } from "@/components/ClientForm";
import { ConfirmAction } from "@/components/ConfirmAction";
import { setClientArchived, deleteClient } from "@/app/actions/clients";
import { formatMoney } from "@/lib/invoice";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client }, { data: projects }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("projects")
      .select("id, name, color, rate")
      .eq("client_id", id)
      .order("name", { ascending: true }),
  ]);
  if (!client) notFound();
  const projectList = projects ?? [];
  const archived = client.is_archived;

  return (
    <div className="page page-doc">
      <nav className="flex items-center gap-2 text-sm text-ink-3">
        <Link href="/clients" className="hover:text-ink transition-colors">
          Clients
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-2 truncate">{client.name}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
          <p className="text-sm text-ink-2 mt-1">
            {client.default_rate != null
              ? `${formatMoney(client.default_rate, client.currency)} / hour default`
              : "No default rate set"}
            {archived && " · Archived"}
          </p>
        </div>
      </div>

      <section>
        <h2 className="panel-title mb-3">Details</h2>
        <ClientForm mode="edit" client={client} />
      </section>

      <section>
        <div className="flex items-baseline gap-2 mb-3">
          <h2 className="panel-title">Projects</h2>
          <span className="num text-xs text-ink-3">{projectList.length}</span>
        </div>
        {projectList.length === 0 ? (
          <div className="panel py-10 px-6 text-center">
            <p className="text-sm text-ink-2">
              No projects linked to this client yet.
            </p>
          </div>
        ) : (
          <div className="panel overflow-hidden">
            {projectList.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 border-b border-line last:border-b-0 hover:bg-paper-2 transition-colors"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                    style={{ background: p.color }}
                  />
                  <span className="font-medium truncate">{p.name}</span>
                </span>
                <span className="num text-xs text-ink-3 shrink-0">
                  {p.rate != null
                    ? `${formatMoney(p.rate, client.currency)}/h`
                    : "inherits"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-line pt-6 flex flex-wrap items-center gap-3">
        <form
          action={async () => {
            "use server";
            await setClientArchived(id, !archived);
          }}
        >
          <button type="submit" className="btn">
            {archived ? "Unarchive client" : "Archive client"}
          </button>
        </form>
        <ConfirmAction
          action={deleteClient.bind(null, id)}
          label="Delete client"
          confirmLabel="Delete client?"
          className="btn btn-ghost"
        />
        <p className="text-xs text-ink-3 ml-auto">
          Clients with invoices can’t be deleted — archive instead.
        </p>
      </section>
    </div>
  );
}

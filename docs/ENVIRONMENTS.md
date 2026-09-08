# Environments

FluxWork runs as two independent stacks. Nothing is shared between them — not
the database, not the auth users, not the billing state.

| | dev | prod |
|---|---|---|
| Git branch | `dev` | `master` |
| Vercel project | `fluxwork-dev` | `fluxwork-live` |
| App URL | `task-tracking-ten.vercel.app` | `fluxwork-gamma.vercel.app` |
| Supabase project | `[DEV] FluxWork` — ref `mojfjsrrckooeitxhsyl`, eu-central-1 | `[LIVE] FluxWork` — ref `jkhnppqrdnqdidrynzzc`, eu-west-1 |
| Paddle | sandbox | sandbox today, live later |
| Local `npm run dev` | uses **dev** Supabase | never |

The dev project is the *original* database — the one that was live through
development, carrying the schema and a handful of test rows. Production moved
to a brand-new, empty project instead of the other way round, so prod starts
with no users and no history. That is deliberate: it means production has never
been written to by a development session.

**The Supabase MCP server is scoped to the dev project** (`.mcp.json` pins
`project_ref=mojfjsrrckooeitxhsyl`). Leave it that way. An agent cannot then
reach production by accident, and production DDL is forced through migration
files and the CLI — which is the rule this repo learned the hard way.

## Why two Vercel projects instead of preview deployments

The obvious setup — one project, `dev` branch on a preview URL — does not work
here. The `fluxwork-live` project has Vercel Authentication set to
`all_except_custom_domains`, so every preview URL sits behind an SSO wall and
inbound webhooks get a 401: the Supabase Send Email hook and the Paddle webhook
would both silently fail on dev.

A second Vercel project has its *own* production domain, which is exempt from
that wall exactly as prod's is. Hobby allows unlimited projects, so this costs
nothing.

## Which env vars differ

Per-environment — set separately on each Vercel project and in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` — each points at its own Supabase project.
- `AUTH_EMAIL_SITE_URL` — the origin confirmation links are built from. A wrong
  value here mails users into the other environment.
- `AUTH_EMAIL_HOOK_SECRET` — each Supabase project's Send Email hook mints its
  own secret.
- `PADDLE_WEBHOOK_SECRET` — one webhook destination per environment.
- `CRON_SECRET` — independent, so a leaked dev value cannot trigger prod.

Shared for now: `RESEND_API_KEY`, `AUTH_EMAIL_FROM`,
`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_PRICE_ID`,
`NEXT_PUBLIC_PADDLE_ENV=sandbox`. These diverge the day prod flips to Paddle
live.

`PADDLE_API_KEY` stays in `.env.local` only — nothing at runtime reads it, only
`npm run paddle:setup` does.

## Bring-up order

Order matters: the production database started **empty**. Flipping the
production app's env vars before the schema was pushed would have taken prod
down, so the schema went first.

### Done

- **Schema.** All 13 migrations applied to the production project via
  `supabase link --project-ref jkhnppqrdnqdidrynzzc && supabase db push`. No
  database password was needed — the CLI provisions a login role from the
  access token. `supabase/migrations/` is the verified history of what the
  original database ran, so prod is schema-identical to dev. `db push` targets
  whatever is linked and there is no undo, so check the linked ref first.
- **Vercel env.** Both projects carry a full set for Production and Preview.
  `fluxwork-live` points at the new prod database; `fluxwork-dev` at the
  original one.
- **Code.** `master` and `dev` both at the same commit; both environments
  deployed and answering (`/login` 200, protected routes 307).
- **Paddle.** A sandbox destination for dev exists —
  `ntfset_01m21bdze0dehkrtd68my62dgn` → the dev `/api/paddle/webhook`, with the
  same six subscribed events as prod. Its secret is set as the dev
  `PADDLE_WEBHOOK_SECRET`.
- **Local.** `.env.local` points at the dev database with
  `AUTH_EMAIL_SITE_URL=http://localhost:3000`.

Gotcha worth remembering: piping a value into `vercel env add` through a
PowerShell pipeline appends a newline, and Vercel rejects a `CRON_SECRET` with
trailing whitespace ("not allowed in HTTP header values") — which fails the
build, not just the cron. Always pass `--value`.

### Still manual

- **Production Supabase auth.** The new project has no Send Email hook, so the
  prod `AUTH_EMAIL_HOOK_SECRET` is still the *old* project's and means nothing
  there. Set Auth → Hooks → **Send Email** →
  `https://fluxwork-gamma.vercel.app/api/auth/send-email`, then copy the
  generated secret onto `fluxwork-live`. (Careful: *Customize Access Token JWT
  Claims* is a different hook — setting that one by mistake breaks login.)
  Also set Site URL to the prod origin.
- **Dev Supabase auth.** Its Send Email hook still points at the prod app, left
  over from when this project *was* prod. Repoint it to
  `https://task-tracking-ten.vercel.app/api/auth/send-email`; the secret is
  unchanged, so no env edit follows. Site URL / Redirect URLs = the dev origin
  plus `http://localhost:3000`.
- **Leaked Password Protection** is off on both projects.
- **Duplicate Paddle destinations.** Two identical sandbox destinations point
  at the prod webhook, so prod receives every event twice. Harmless — the
  handler dedupes on `paddle_events.event_id` — but one should be deactivated.
- **Ignored Build Step** on `fluxwork-live`, so it stops building branches
  other than `master`:

  ```sh
  if [ "$VERCEL_GIT_COMMIT_REF" = "master" ]; then exit 1; else exit 0; fi
  ```

  (Exit 1 means "build", exit 0 means "skip" — inverted from what you would
  guess.) Dashboard-only; neither the CLI nor the documented REST API exposes
  it, same as Production Branch.

Going live on Paddle stays a separate deliberate flip: live client token, live
price id, `NEXT_PUBLIC_PADDLE_ENV=production`, and a Default Payment Link on an
approved domain — live requires Checkout → Website approval, which is not
instant.

## Working rules

**Schema changes never go straight into prod.** Write a migration file, push it
to dev, verify, then push to prod. The whole reason this repo had no usable
migration history is that changes were applied directly to the remote database.

**Beware `CREATE OR REPLACE VIEW`.** It resets any reloptions the replacing
statement does not restate. That is how `task_rollups` lost
`security_invoker = on` and started exposing every user's rows. When editing a
view, either restate `with (security_invoker = on)` or follow up with
`alter view ... set`.

**Cron runs on production deployments only**, so the weekly digest fires from
prod. To exercise it on dev, call `/api/digest` by hand with the dev
`CRON_SECRET` as a bearer token.

**Regenerate `src/lib/database.types.ts` against dev**, then commit — the
generated types must track the migrations, not whichever environment happens to
be ahead.

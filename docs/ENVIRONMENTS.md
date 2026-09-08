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

Order matters: the production database is **empty**. Flipping the production
app's env vars before the schema is pushed takes prod down.

### 1. Schema into the new production project

```bash
npx supabase login
npx supabase link --project-ref jkhnppqrdnqdidrynzzc
npx supabase db push
```

`supabase/migrations/` is the verified history of what the original database
actually ran, so prod lands schema-identical to dev. Check the linked ref
before every push — `db push` targets whatever is linked and there is no undo.

### 2. Configure the production Supabase project

- Auth → Hooks → **Send Email** → `https://fluxwork-gamma.vercel.app/api/auth/send-email`.
  Copy the generated secret into the prod `AUTH_EMAIL_HOOK_SECRET`. Without
  this, signup on prod fails outright. (Careful: *Customize Access Token JWT
  Claims* is a different hook — setting that one by mistake breaks login.)
- Auth → URL Configuration → Site URL = the prod origin.
- Auth → enable Leaked Password Protection (it is off by default).
- Storage buckets are created by the migrations; nothing to do by hand.

### 3. Switch the production Vercel project onto the new database

Update `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` and `AUTH_EMAIL_HOOK_SECRET` on the `fluxwork-live`
project, then redeploy. Until the redeploy, prod still talks to the dev
database.

### 4. Dev Supabase project

Its schema is already current. Only the hook target moves:
Auth → Hooks → Send Email → `https://task-tracking-ten.vercel.app/api/auth/send-email`,
and Site URL / Redirect URLs = the dev origin plus `http://localhost:3000`.

### 5. The dev Vercel project

`fluxwork-dev` already exists and is connected to the same repo. It was created
with **Production Branch = `master`**, which must become `dev` — otherwise both
projects deploy the same branch and there is no dev environment at all. That
setting is dashboard-only: neither the CLI nor the documented REST API exposes
it.

Its auto-generated domain is `task-tracking-ten.vercel.app`, inherited from the
repo name. Cosmetic — a project domain is stable regardless of what it is
called, and nothing depends on it beyond `AUTH_EMAIL_SITE_URL` and the webhook
targets pointing at the same string.

On the `fluxwork-live` project, set an Ignored Build Step so it stops building
anything but `master`:

```sh
if [ "$VERCEL_GIT_COMMIT_REF" = "master" ]; then exit 1; else exit 0; fi
```

(Exit 1 means "build", exit 0 means "skip" — the sense is inverted from what
you would guess.)

### 6. Point local development at dev

`.env.local` already holds the dev project's values, since dev *is* the
original database. Only `AUTH_EMAIL_SITE_URL` changes, to
`http://localhost:3000`.

### 7. Paddle

Sandbox has one webhook destination, currently aimed at the prod URL. Add a
second aimed at `https://task-tracking-ten.vercel.app/api/paddle/webhook` and put
its secret in the dev `PADDLE_WEBHOOK_SECRET`; keep the existing one for prod.

Going live is a separate deliberate flip: live client token, live price id,
`NEXT_PUBLIC_PADDLE_ENV=production`, and a Default Payment Link on an approved
domain — live requires Checkout → Website approval, which is not instant.

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

# Environments

FluxWork runs as two independent stacks. Nothing is shared between them — not
the database, not the auth users, not the billing account.

| | dev | prod |
|---|---|---|
| Git branch | `dev` | `master` |
| Vercel project | `fluxwork-dev` | `fluxwork` |
| App URL | `fluxwork-dev.vercel.app` | `fluxwork-gamma.vercel.app` |
| Supabase project | `fluxwork-dev` | `fluxwork` (ref `mojfjsrrckooeitxhsyl`) |
| Paddle | sandbox | sandbox today, live later |
| Local `npm run dev` | uses **dev** Supabase | never |

## Why two Vercel projects instead of preview deployments

The obvious setup — one project, `dev` branch on a preview URL — does not work
here. The `fluxwork` project has Vercel Authentication set to
`all_except_custom_domains`, so every preview URL sits behind an SSO wall and
inbound webhooks get a 401: the Supabase Send Email hook and the Paddle webhook
would both silently fail on dev.

A second Vercel project has its *own* production domain, which is exempt from
that wall exactly as prod's is. Hobby allows unlimited projects, so this costs
nothing.

## Which env vars differ

Per-environment (must be set separately on each Vercel project and in
`.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` — each points at its own Supabase project.
- `AUTH_EMAIL_SITE_URL` — the origin confirmation links are built from. Wrong
  value here sends users to the other environment.
- `AUTH_EMAIL_HOOK_SECRET` — each Supabase project's Send Email hook mints its
  own secret.
- `PADDLE_WEBHOOK_SECRET` — one webhook destination per environment.
- `CRON_SECRET` — independent secrets so a leaked dev value cannot trigger prod.

Shared (same value in both, for now): `RESEND_API_KEY`, `AUTH_EMAIL_FROM`,
`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_PRICE_ID`,
`NEXT_PUBLIC_PADDLE_ENV=sandbox`. These diverge the day prod flips to Paddle
live.

`PADDLE_API_KEY` stays in `.env.local` only — nothing at runtime reads it, only
`npm run paddle:setup` does.

## Setup — the steps that need a human

### 1. Create the dev Supabase project

Dashboard → New project, same organization (the free tier allows 2 projects and
one slot is open). Name it `fluxwork-dev`. Save the DB password somewhere; the
CLI asks for it.

Then push the schema:

```bash
npx supabase login
npx supabase link --project-ref <dev-ref>
npx supabase db push
```

`supabase/migrations/` is the full, verified history of what prod actually ran,
so the dev project lands byte-identical to prod. Check the linked ref before
every push — `db push` targets whatever is linked, and there is no undo.

Then in the dev project's dashboard:

- Auth → Hooks → **Send Email** → `https://fluxwork-dev.vercel.app/api/auth/send-email`.
  Copy the generated secret into that project's `AUTH_EMAIL_HOOK_SECRET`.
  (Careful: *Customize Access Token JWT Claims* is a different hook — setting
  that one by mistake breaks login.)
- Auth → URL Configuration → Site URL and Redirect URLs: the dev origin plus
  `http://localhost:3000`.
- Storage: the `invoice-templates` and `invoices` buckets are created by the
  migrations, nothing to do by hand.

### 2. Branch `dev` — done

Working branch is `dev`; `master` only ever receives merges.

### 3. Create the dev Vercel project

Import the same GitHub repo again as `fluxwork-dev`, then Settings → Git →
**Production Branch = `dev`**. Add the env vars from the table above.

On the existing `fluxwork` project, set an Ignored Build Step so it stops
building anything but `master`:

```sh
if [ "$VERCEL_GIT_COMMIT_REF" = "master" ]; then exit 1; else exit 0; fi
```

(Exit 1 means "build", exit 0 means "skip" — the sense is inverted from what
you would guess.)

### 4. Point local development at dev

Swap the three Supabase values in `.env.local` for the dev project's, and set
`AUTH_EMAIL_SITE_URL=http://localhost:3000`. Until this is done, `npm run dev`
reads and writes the live database.

### 5. Retarget the Paddle sandbox webhook

The sandbox webhook destination currently points at prod. Point it at
`https://fluxwork-dev.vercel.app/api/paddle/webhook` and put its secret in the
dev project's `PADDLE_WEBHOOK_SECRET`. Prod keeps sandbox until the live
migration, which is a separate deliberate flip (live client token, live price
id, `NEXT_PUBLIC_PADDLE_ENV=production`, and a Default Payment Link on an
approved domain — live requires Checkout → Website approval, which is not
instant).

## Working rules

**Schema changes never go straight into prod.** Write a migration file, push it
to dev, verify, then push to prod. The whole reason this repo had no usable
migration history is that changes were applied directly to the remote database.

**Beware `CREATE OR REPLACE VIEW`.** It resets any reloptions the replacing
statement does not restate. That is how `task_rollups` lost
`security_invoker = on` and started leaking every user's rows. When editing a
view, either restate `with (security_invoker = on)` or follow up with
`alter view ... set`.

**Cron runs on production deployments only**, so the weekly digest fires from
prod. To exercise it on dev, call `/api/digest` by hand with the dev
`CRON_SECRET` as a bearer token.

**Regenerate types against dev**, then commit: the generated
`src/lib/database.types.ts` must match the migrations, not whatever one
environment happens to have.

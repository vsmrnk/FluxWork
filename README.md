# FluxWork

Time tracking and invoicing for freelancers. Next.js (App Router) on Vercel,
Supabase (Postgres, auth, storage), Paddle billing, Resend email.

## Setup

```sh
npm install
cp .env.example .env.local   # fill in, pointing at the dev Supabase project
npm run dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm run verify` | End-to-end check against the database in `.env.local`: RLS, roll-up views, cascades |
| `npm run verify:snapshot` | Regression test: a generated invoice keeps its rates after they change |
| `npm run paddle:setup` | Creates the Paddle product and price (idempotent) |

The verify scripts sign in as `TEST_EMAIL` / `TEST_PASSWORD`; create that user
once with `npm run verify -- signup`.

Environments, migrations and deployment: [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md).

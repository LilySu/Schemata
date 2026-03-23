# Local Development Setup

## 1) Install tool versions

Recommended versions:
- Node.js: `22.x` (see `.nvmrc`)
- pnpm: `9.13.0+`
- Python: `3.12.x` (only needed if working on the FastAPI backend)
- uv: `0.5.24+` (only needed if working on the FastAPI backend)

## 2) Install frontend dependencies

```bash
pnpm install
```

## 3) Configure environment variables

```bash
cp .env.example .env
```

Required:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` — Supabase anon key
- `DATABASE_URL` — Direct Postgres connection string (Supabase)
- At least one AI provider key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_GENERATIVE_AI_API_KEY`)

Optional:
- `AI_MODEL` — model selection in `provider/model` format (default: `google/gemini-2.5-flash-lite`)
- `GITHUB_PAT` — increases GitHub API rate limit from 60/hr to 5,000/hr

## 4) Initialize the database

```bash
pnpm db:push
```

Browse the database with `pnpm db:studio`.

## 5) Start the app

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## 6) Verification

```bash
pnpm check        # TypeScript + ESLint
pnpm test          # Frontend tests (Vitest)
pnpm build         # Production build
```

### Optional: FastAPI backend

If working on the Python backend:

```bash
cd backend
uv sync --no-install-project
uv run pytest -q
cd ..
```

To run it locally:

```bash
pnpm dev:backend
```

Then set in `.env`:
```
NEXT_PUBLIC_USE_LEGACY_BACKEND=true
NEXT_PUBLIC_API_DEV_URL=http://localhost:8000
```

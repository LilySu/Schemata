# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Schemata converts GitHub repositories into interactive React Flow diagrams. It uses a hybrid pipeline: deterministic file-tree analysis for nodes + a single LLM call for edges. Diagrams are rendered with React Flow + Dagre layout. The frontend is Next.js (Vercel) with a FastAPI backend (Railway) as an optional fallback.

## Commands

### Frontend (pnpm, Node 22)
```bash
pnpm install          # Install dependencies
pnpm dev              # Start Next.js dev server (Turbo)
pnpm build            # Production build
pnpm lint             # ESLint
pnpm check            # Type-check + lint
pnpm test             # Vitest (frontend unit tests)
pnpm format:write     # Prettier formatting
```

### Backend (Python 3.12, uv)
```bash
cd backend
uv sync --no-install-project   # Install pinned deps into .venv
uv run pytest -q               # Run all backend tests
uv run pytest tests/path/test_file.py::test_name  # Run single test
uv run python -m compileall app  # Compile check
```

### Database
```bash
pnpm db:push       # Push schema changes to Postgres
pnpm db:generate   # Generate Drizzle migration files
pnpm db:studio     # Open Drizzle Studio
```

### Local Development
```bash
# Start FastAPI backend (Docker, recommended for production parity)
docker-compose up --build -d
docker-compose logs -f api

# OR start FastAPI backend directly
pnpm dev:backend   # runs uvicorn via uv
```

To route the Next.js frontend to a local FastAPI backend, set in `.env`:
```
NEXT_PUBLIC_USE_LEGACY_BACKEND=true
NEXT_PUBLIC_API_DEV_URL=http://localhost:8000
```

## Architecture

### Dual-Backend Design
The app supports two generation backends controlled by `NEXT_PUBLIC_USE_LEGACY_BACKEND`:
- **Next.js Route Handlers** (`src/app/api/generate/`) — primary path
- **FastAPI** (`backend/`) on Railway — optional fallback

Both expose the same SSE streaming API. The frontend (`src/features/diagram/api.ts`) routes to one or the other transparently.

### Hybrid Generation Pipeline
Top-level diagram generation:
1. **Deterministic Analysis** (instant) — `src/server/generate/analyzer.ts` analyzes the file tree to extract nodes, groups, and tech stack without any LLM calls
2. **LLM Edge Generation** (single call) — `SYSTEM_EDGES_PROMPT` generates relationships between pre-computed nodes

Drill-down sub-diagrams use two LLM calls (explanation + diagram generation).

After the top-level diagram completes, `/api/generate/prefetch` pre-generates all one-level-down sub-diagrams in the background.

### Streaming State Machine
SSE events flow through states: `idle → started → analyzing → diagram_item → complete`

Frontend: `src/hooks/diagram/useDiagramStream.ts` manages state.

### AI Provider System
Uses Vercel AI SDK (`ai` package) with multi-provider support:
- Model selection via `AI_MODEL` env var (format: `provider/model`, e.g. `google/gemini-2.5-flash-lite`)
- Fallback models via `AI_FALLBACK_MODELS`
- Optional AI Gateway mode via `USE_AI_GATEWAY=true`
- Provider resolution: `src/server/generate/provider.ts`

### GitHub Authentication Priority
1. User-supplied PAT (from localStorage)
2. `GITHUB_PAT` env var
3. GitHub App (CLIENT_ID + PRIVATE_KEY + INSTALLATION_ID)

### Caching
Generated diagrams are cached in Supabase PostgreSQL (`gitdiagram_diagram_cache` table, schema at `src/server/db/schema.ts`) keyed by `(username, repo)`. Sub-diagrams cached in `gitdiagram_sub_diagram_cache` keyed by `(username, repo, scope_path)`. Server action: `src/app/_actions/cache.ts`.

### Path Aliases
TypeScript uses `~/*` → `./src/*`.

## Key File Locations

| Concern | Frontend | Backend |
|---|---|---|
| Deterministic analyzer | `src/server/generate/analyzer.ts` | — |
| AI provider/streaming | `src/server/generate/provider.ts`, `llm.ts` | `backend/app/services/openai_service.py` |
| Model config | `src/server/generate/model-config.ts` | `backend/app/services/model_config.py` |
| Prompts | `src/server/generate/prompts.ts` | `backend/app/prompts.py` |
| GitHub client | `src/server/generate/github.ts` | `backend/app/services/github_service.py` |
| Stream endpoint | `src/app/api/generate/stream/` | `backend/app/routers/generate.py` |
| Prefetch endpoint | `src/app/api/generate/prefetch/` | — |
| DB schema | `src/server/db/schema.ts` | — |
| Diagram component | `src/components/flow-diagram.tsx` | — |
| Custom node types | `src/components/flow-nodes/` | — |
| Main diagram hook | `src/hooks/useDiagram.ts` | — |
| Frontend API client | `src/features/diagram/api.ts` | — |

## Environment Variables

Minimum required (see `.env.example` for full list):
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` — Supabase anon/publishable key
- `DATABASE_URL` — Direct Postgres connection string (Supabase)
- At least one AI provider key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_GENERATIVE_AI_API_KEY`)
- `AI_MODEL` — model in `provider/model` format (default: `google/gemini-2.5-flash-lite`)
- `GITHUB_PAT` — optional but avoids GitHub rate limits

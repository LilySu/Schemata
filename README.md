# Schemata

A fork of [GitDiagram](https://gitdiagram.com) that visualizes any GitHub repository as an interactive, explorable diagram. Unlike the original — which uses 3 LLM calls per diagram and generates flat, non-expandable Mermaid charts — Schemata uses a hybrid approach that minimizes LLM usage and recursively pre-generates every layer of the directory tree in the background.

<p align="center">
  <img src="https://github.com/LilySu/Schemata/raw/main/docs/Schemata_01.png" alt="Schemata example" width="100%" />
</p>

<p align="center">
  <a href="https://youtu.be/OgBiJI3oBdQ">Watch on YouTube</a>
</p>

## How Schemata Differs from GitDiagram

| | GitDiagram | Schemata |
|---|---|---|
| **LLM calls per diagram** | 3 (explanation + mapping + Mermaid generation) | 1 (edge generation only — nodes are deterministic) |
| **Diagram format** | Mermaid.js (text-based, requires syntax validation + fix loop of up to 3 extra LLM calls) | React Flow (JSON nodes/edges, no syntax issues) |
| **Drill-down** | None — flat single-level diagram | Recursive — click any directory to explore deeper, all the way down |
| **Background prefetch** | None | As soon as the current diagram loads, all child directories are pre-generated in the background |
| **Node generation** | LLM generates everything | Deterministic file tree analysis — nodes appear instantly, LLM only adds edges |

## Features

- **Instant Nodes, Streaming Edges**: Nodes appear immediately from deterministic file tree analysis. A single LLM call then streams in the relationships between them — no waiting for 3 sequential LLM stages.
- **Recursive Background Prefetch**: The moment the current diagram renders, a background request (`/api/generate/prefetch`) pre-generates sub-diagrams for every child directory one level down. When you click a directory node, its diagram is already cached and loads instantly. This continues recursively — each sub-diagram triggers prefetch for *its* children — until the entire directory tree has been explored down to leaf directories.
- **Clickable Nodes**: Click on components to navigate directly to source files and directories on GitHub
- **Drill-Down**: Click directory nodes to generate deeper sub-diagrams of that module's internal structure
- **Private Repos**: Provide a GitHub PAT to diagram private repositories
- **Caching**: Generated diagrams are cached in Supabase PostgreSQL so repeat visits load instantly
- **Multi-Provider AI**: Swap between OpenAI, Google Gemini, and Anthropic with a single env var

## Tech Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS, ShadCN UI
- **Diagram Rendering**: React Flow (@xyflow/react) with Dagre layout
- **AI**: [Vercel AI SDK](https://sdk.vercel.ai/) (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`) for unified multi-provider LLM streaming
- **AI Gateway**: Optional [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) support — a single API key routes to any provider via `https://ai-gateway.vercel.sh/v1` (enable with `USE_AI_GATEWAY=true`)
- **Database**: [Supabase](https://supabase.com/) PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- **Backend**: FastAPI (Python) on Railway, with Next.js Route Handlers as fallback
- **GitHub API**: File tree + README fetching with PAT authentication

## Local Development

1. Clone the repository

```bash
git clone git@github.com:LilySu/Schemata.git
cd Schemata
```

2. Install dependencies

```bash
pnpm install
```

3. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials (see `.env.example` for the full list):

```bash
# Required — Supabase
NEXT_PUBLIC_SUPABASE_URL="https://your-project-ref.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY="your-anon-key"
DATABASE_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"

# Required — AI provider (at least one)
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# GOOGLE_GENERATIVE_AI_API_KEY=...

# Model selection (format: provider/model)
AI_MODEL=google/gemini-2.5-flash-lite
# AI_FALLBACK_MODELS=google/gemini-2.5-flash

# Optional — Vercel AI Gateway (replaces individual provider keys)
# USE_AI_GATEWAY=true
# AI_GATEWAY_API_KEY=

# Optional — GitHub PAT (increases rate limit from 60/hr to 5,000/hr)
GITHUB_PAT=ghp_...

# Optional — GitHub App auth (alternative to PAT)
# GITHUB_CLIENT_ID=
# GITHUB_PRIVATE_KEY=
# GITHUB_INSTALLATION_ID=

# Optional — route frontend to external FastAPI backend
NEXT_PUBLIC_USE_LEGACY_BACKEND=false
NEXT_PUBLIC_API_DEV_URL=http://localhost:8000

# Optional — backend config
# API_ANALYTICS_KEY=
# CORS_ORIGINS=http://localhost:3000
# ENVIRONMENT=development
# PORT=8000
```

4. Initialize the database

```bash
pnpm db:push
```

You can browse the database with `pnpm db:studio`.

5. Run the app

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Optional: Run FastAPI backend

For production parity, run the FastAPI backend via Docker:

```bash
docker-compose up --build -d
docker-compose logs -f api
```

Then set in `.env`:
```
NEXT_PUBLIC_USE_LEGACY_BACKEND=true
NEXT_PUBLIC_API_DEV_URL=http://localhost:8000
```

### Validation

```bash
pnpm check        # TypeScript + ESLint
pnpm test          # Frontend tests (Vitest)
pnpm build         # Production build
cd backend && uv run pytest -q  # Backend tests
```

## Architecture

### Hybrid Generation Pipeline

1. **Deterministic Analysis** (instant, zero LLM calls) — `src/server/generate/analyzer.ts` parses the file tree to extract nodes, groups, and tech stack. Nodes appear on the diagram immediately.
2. **LLM Edge Generation** (single call) — One LLM call streams relationships between the pre-computed nodes and identifies up to 5 missing components. Edges appear progressively via the Vercel AI SDK's `streamText()` API.

This is fundamentally different from GitDiagram's 3-stage pipeline (explanation → mapping → Mermaid generation), which requires 3 sequential LLM calls minimum and up to 6 if the Mermaid syntax validation fails. Schemata needs exactly 1 LLM call per diagram level.

### Recursive Background Prefetch

The key innovation is aggressive background pre-generation of the entire directory tree:

1. User visits `/:username/:repo` → top-level diagram generates (1 LLM call)
2. The moment the diagram renders, the frontend fires a background request to `/api/generate/prefetch`
3. The prefetch endpoint identifies all directory nodes in the current diagram and generates a sub-diagram for each one (1 LLM call per directory, all in parallel)
4. Each of those sub-diagrams, once cached, triggers prefetch for *its* child directories
5. This continues recursively until every directory in the repository has a cached diagram — down to leaf directories with no subdirectories

The result: the first diagram takes a few seconds. Every subsequent drill-down click is instant because the diagram was already generated and cached in the background. For a typical repo, the entire tree is fully pre-cached within 30-60 seconds of the initial page load.

All diagrams are cached in Supabase — `gitdiagram_diagram_cache` for the root level, `gitdiagram_sub_diagram_cache` for every subdirectory. Once cached, the LLM is never called again for that repo.

### Supabase Database Schema

The app uses Supabase as its PostgreSQL host. Drizzle ORM manages the schema with a `gitdiagram_` table prefix. Connection is established via `DATABASE_URL` or derived from `NEXT_PUBLIC_SUPABASE_URL` (see `src/server/db/index.ts`).

#### `gitdiagram_diagram_cache`

Caches generated diagrams at the repository level. Primary key: `(username, repo)`.

| Column | Type | Description |
|---|---|---|
| `username` | varchar(256) | GitHub username/org |
| `repo` | varchar(256) | Repository name |
| `diagram` | text | Generated diagram data (JSON) |
| `explanation` | text | LLM explanation of the architecture |
| `created_at` | timestamptz | First generation time |
| `updated_at` | timestamptz | Last regeneration time |
| `used_own_key` | boolean | Whether the user provided their own API key |

#### `gitdiagram_sub_diagram_cache`

Caches drill-down sub-diagrams for specific directories or files. Primary key: `(username, repo, scope_path)`.

| Column | Type | Description |
|---|---|---|
| `username` | varchar(256) | GitHub username/org |
| `repo` | varchar(256) | Repository name |
| `scope_path` | varchar(1024) | Directory or file path being visualized |
| `diagram` | text | Generated sub-diagram data (JSON) |
| `explanation` | text | LLM explanation of the module |
| `is_leaf` | boolean | Whether this scope has no deeper drill-down |
| `created_at` | timestamptz | First generation time |
| `updated_at` | timestamptz | Last regeneration time |

Schema definition: `src/server/db/schema.ts`

### Vercel AI SDK & AI Gateway

The AI layer (`src/server/generate/provider.ts`) supports two modes:

**Direct Provider Mode** (default) — Set `AI_MODEL` in `provider/model` format:

| Provider prefix | SDK package | API key env var |
|---|---|---|
| `openai/` | `@ai-sdk/openai` | `OPENAI_API_KEY` |
| `anthropic/` | `@ai-sdk/anthropic` | `ANTHROPIC_API_KEY` |
| `google/` | `@ai-sdk/google` | `GOOGLE_GENERATIVE_AI_API_KEY` |

**AI Gateway Mode** (optional) — Set `USE_AI_GATEWAY=true` and `AI_GATEWAY_API_KEY` to route all LLM calls through Vercel AI Gateway (`https://ai-gateway.vercel.sh/v1`). One API key for all providers, with built-in rate limiting and observability.

Model selection is configured in `src/server/generate/model-config.ts`:
- `AI_MODEL` — primary model (default: `google/gemini-2.5-flash-lite`)
- `AI_FALLBACK_MODELS` — comma-separated fallback models tried in order if the primary fails

### Key Files

| Concern | Frontend | Backend |
|---|---|---|
| Deterministic analyzer | `src/server/generate/analyzer.ts` | — |
| AI provider resolver | `src/server/generate/provider.ts` | `backend/app/services/openai_service.py` |
| Model config | `src/server/generate/model-config.ts` | `backend/app/services/model_config.py` |
| Prompts | `src/server/generate/prompts.ts` | `backend/app/prompts.py` |
| GitHub client | `src/server/generate/github.ts` | `backend/app/services/github_service.py` |
| Stream endpoint | `src/app/api/generate/stream/route.ts` | `backend/app/routers/generate.py` |
| Prefetch endpoint | `src/app/api/generate/prefetch/route.ts` | — |
| DB connection | `src/server/db/index.ts` | — |
| DB schema | `src/server/db/schema.ts` | — |
| Diagram component | `src/components/flow-diagram.tsx` | — |
| Main hook | `src/hooks/useDiagram.ts` | — |

## Attribution

Forked from [GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram) by [Ahmed Khaleel](https://ahmedkhaleel.com). Original project inspiration from [Gitingest](https://gitingest.com/) by Romain Courtois.

---

import type {
  GraphNode,
  GraphGroup,
  GraphNodeType,
} from "~/features/diagram/graph-types";

export interface RepoAnalysis {
  projectType: string;
  techStack: string[];
  summary: string;
  externalServices: string[];
  components: GraphNode[];
  groups: GraphGroup[];
}

// ── Pattern tables ────────────────────────────────────────────────

const PROJECT_INDICATORS: Record<string, { files: string[]; label: string }> = {
  nextjs: { files: ["next.config.js", "next.config.ts", "next.config.mjs"], label: "Next.js" },
  react: { files: ["src/App.tsx", "src/App.jsx", "src/App.js"], label: "React" },
  vue: { files: ["vue.config.js", "nuxt.config.ts", "src/App.vue"], label: "Vue" },
  angular: { files: ["angular.json", "src/app/app.module.ts"], label: "Angular" },
  svelte: { files: ["svelte.config.js", "src/routes/"], label: "SvelteKit" },
  express: { files: ["server/index.js", "server/index.ts", "src/server.ts"], label: "Express" },
  fastapi: { files: ["backend/app/main.py", "app/main.py"], label: "FastAPI" },
  django: { files: ["manage.py", "settings.py"], label: "Django" },
  flask: { files: ["app.py", "wsgi.py"], label: "Flask" },
  rails: { files: ["Gemfile", "config/routes.rb"], label: "Ruby on Rails" },
  rust: { files: ["Cargo.toml", "src/main.rs"], label: "Rust" },
  go: { files: ["go.mod", "main.go"], label: "Go" },
};

const TECH_FILE_INDICATORS: Record<string, string> = {
  "package.json": "Node.js",
  "tsconfig.json": "TypeScript",
  "pyproject.toml": "Python",
  "requirements.txt": "Python",
  "Cargo.toml": "Rust",
  "go.mod": "Go",
  "Gemfile": "Ruby",
  "docker-compose.yml": "Docker",
  "Dockerfile": "Docker",
  ".github/workflows/": "GitHub Actions",
  "terraform/": "Terraform",
  "k8s/": "Kubernetes",
  "tailwind.config.ts": "Tailwind CSS",
  "tailwind.config.js": "Tailwind CSS",
  "prisma/": "Prisma",
  "drizzle.config.ts": "Drizzle ORM",
  // .env.example detected but not emitted as a node (it's config boilerplate)
};

interface LayerPattern {
  patterns: string[];
  layer: string;
  style: string;
  nodeType: GraphNodeType;
}

const LAYER_PATTERNS: LayerPattern[] = [
  { patterns: ["src/app/", "src/pages/", "frontend/", "client/", "src/components/", "src/views/"], layer: "Frontend", style: "frontend", nodeType: "service" },
  { patterns: ["src/app/api/", "backend/routers/", "backend/routes/", "routes/", "api/", "src/api/"], layer: "API", style: "backend", nodeType: "api" },
  { patterns: ["backend/", "server/", "src/server/", "backend/app/services/"], layer: "Backend", style: "backend", nodeType: "service" },
  { patterns: ["src/db/", "src/server/db/", "migrations/", "prisma/", "drizzle/"], layer: "Data", style: "data", nodeType: "database" },
  { patterns: [".github/workflows/", "Dockerfile", "docker-compose", "k8s/", "terraform/", ".replit"], layer: "Infrastructure", style: "infra", nodeType: "config" },
  { patterns: ["src/hooks/", "src/lib/", "src/utils/", "src/helpers/", "lib/", "utils/"], layer: "Utilities", style: "frontend", nodeType: "function" },
  { patterns: ["src/features/", "src/modules/", "src/domains/"], layer: "Features", style: "frontend", nodeType: "service" },
];

const EXTERNAL_INDICATORS: Record<string, { label: string; group: string }> = {
  "openai": { label: "OpenAI API", group: "External Services" },
  "anthropic": { label: "Anthropic API", group: "External Services" },
  "stripe": { label: "Stripe", group: "External Services" },
  "supabase": { label: "Supabase", group: "External Services" },
  "firebase": { label: "Firebase", group: "External Services" },
  "aws": { label: "AWS", group: "External Services" },
  "github": { label: "GitHub API", group: "External Services" },
  "postgres": { label: "PostgreSQL", group: "Data Layer" },
  "mongodb": { label: "MongoDB", group: "Data Layer" },
  "redis": { label: "Redis", group: "Data Layer" },
  "elasticsearch": { label: "Elasticsearch", group: "Data Layer" },
  "posthog": { label: "PostHog Analytics", group: "External Services" },
};

// Skip these directories/files as standalone nodes
const SKIP_PATTERNS = [
  // Virtual environments and dependency dirs
  "node_modules/", "__pycache__/", ".venv/", "venv/", ".env/", "env/",
  "myenv/", "virtualenv/", ".virtualenv/", "site-packages/",
  ".tox/", ".mypy_cache/", ".ruff_cache/", ".pytest_cache/",
  // Examples / samples
  "examples/", "example/", "samples/", "sample/", "demos/", "demo/",
  // Build artifacts
  "dist/", "build/", ".next/", "out/", "coverage/", ".cache/",
  // IDE / editor
  ".git/", ".vscode/", ".idea/", ".devcontainer/",
  // Lock files and config boilerplate
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "uv.lock",
  "poetry.lock", "Pipfile.lock", "Gemfile.lock",
  ".gitignore", ".eslintrc", ".prettierrc", "tsconfig.json",
  ".python-version", ".nvmrc", ".node-version", ".tool-versions",
  // Environment files (these are config, not architecture)
  ".env.example", ".env.local", ".env.development", ".env.production",
  ".env.test", ".env",
];

// ── Core analysis ─────────────────────────────────────────────────

export function analyzeRepo(
  fileTree: string,
  readme: string,
  repoName?: string,
): RepoAnalysis {
  let paths = fileTree.split("\n").filter(Boolean);

  // Focus on the logical root directory if one exists
  const rootPrefix = detectLogicalRoot(paths, repoName);
  if (rootPrefix) {
    paths = paths
      .filter((p) => p.startsWith(rootPrefix))
      .map((p) => p.slice(rootPrefix.length));
  }

  const pathSet = new Set(paths);

  const projectType = detectProjectType(paths, pathSet);
  const techStack = detectTechStack(paths, pathSet);
  const extServices = detectExternalServices(readme, paths);
  const { components, groups } = extractComponents(paths, pathSet, extServices);
  const summary = buildSummary(readme, projectType, techStack);

  // Restore full paths for click events if we narrowed the root
  if (rootPrefix) {
    for (const c of components) {
      if (c.path) c.path = rootPrefix + c.path;
    }
  }

  const externalServices = [...extServices.values()].map((s) => s.label);

  return { projectType, techStack, summary, externalServices, components, groups };
}

/**
 * Detect if the repo has a single logical root directory that should be
 * treated as the project root. Priorities:
 * 1. A directory matching the repo name (e.g., "vllm/" in vllm-project/vllm)
 * 2. A "src/" directory (if most source files live under it)
 *
 * Returns the prefix string (e.g., "vllm/" or "src/") or null.
 */
function detectLogicalRoot(
  paths: string[],
  repoName?: string,
): string | null {
  if (!paths.length) return null;

  // Count files per top-level directory
  const topDirCounts = new Map<string, number>();
  for (const p of paths) {
    const firstSlash = p.indexOf("/");
    if (firstSlash === -1) continue; // root-level file
    const topDir = p.slice(0, firstSlash);
    topDirCounts.set(topDir, (topDirCounts.get(topDir) ?? 0) + 1);
  }

  const totalFiles = paths.length;

  // Priority 1: directory matching repo name
  if (repoName) {
    const repoLower = repoName.toLowerCase();
    for (const [dir, count] of topDirCounts) {
      if (dir.toLowerCase() === repoLower && count > totalFiles * 0.3) {
        return dir + "/";
      }
    }
  }

  // Priority 2: "src" directory containing a significant portion of files
  const srcCount = topDirCounts.get("src") ?? 0;
  if (srcCount > totalFiles * 0.4) {
    return "src/";
  }

  return null;
}

function detectProjectType(paths: string[], pathSet: Set<string>): string {
  for (const [type, { files }] of Object.entries(PROJECT_INDICATORS)) {
    for (const file of files) {
      if (file.endsWith("/")) {
        if (paths.some((p) => p.startsWith(file))) return type;
      } else if (pathSet.has(file)) {
        return type;
      }
    }
  }
  if (paths.some((p) => p.endsWith(".py"))) return "python";
  if (paths.some((p) => p.endsWith(".ts") || p.endsWith(".js"))) return "javascript";
  return "unknown";
}

function detectTechStack(paths: string[], pathSet: Set<string>): string[] {
  const stack: string[] = [];
  for (const [indicator, tech] of Object.entries(TECH_FILE_INDICATORS)) {
    if (indicator.endsWith("/")) {
      if (paths.some((p) => p.startsWith(indicator))) stack.push(tech);
    } else if (pathSet.has(indicator)) {
      stack.push(tech);
    }
  }
  return [...new Set(stack)];
}

function detectExternalServices(
  readme: string,
  paths: string[],
): Map<string, { label: string; group: string }> {
  const found = new Map<string, { label: string; group: string }>();
  const combined = (readme + "\n" + paths.join("\n")).toLowerCase();

  for (const [keyword, info] of Object.entries(EXTERNAL_INDICATORS)) {
    if (combined.includes(keyword)) {
      found.set(keyword, info);
    }
  }
  return found;
}

function extractComponents(
  paths: string[],
  pathSet: Set<string>,
  externalServices: Map<string, { label: string; group: string }>,
): { components: GraphNode[]; groups: GraphGroup[] } {
  const components: GraphNode[] = [];
  const groupSet = new Map<string, GraphGroup>();
  const addedPaths = new Set<string>();

  // 1. Find significant directories (depth 1-2) and classify them
  const dirCounts = new Map<string, number>();
  for (const p of paths) {
    if (shouldSkip(p)) continue;
    const parts = p.split("/");
    // Count files in each top-level and second-level directory
    for (let depth = 1; depth <= Math.min(3, parts.length); depth++) {
      const dir = parts.slice(0, depth).join("/");
      dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
    }
  }

  // 2. Extract significant directories as components
  for (const [dir, count] of dirCounts) {
    if (count < 2) continue; // skip directories with only 1 file
    if (shouldSkip(dir + "/")) continue;
    if (addedPaths.has(dir)) continue;

    // Check if a parent is already added — skip if so (avoid duplicates)
    const parts = dir.split("/");
    if (parts.length > 1) {
      const parent = parts.slice(0, -1).join("/");
      // Only skip if parent has enough specificity
      if (addedPaths.has(parent) && dirCounts.get(parent)! < 20) continue;
    }

    const { nodeType, layer, style } = classifyPath(dir);
    const label = humanizeLabel(dir, nodeType);
    const id = toId(dir);

    // Skip components with empty id or label
    if (!id || !label) continue;

    if (!groupSet.has(layer)) {
      groupSet.set(layer, { id: layer, label: layer, style });
    }

    components.push({
      id,
      label,
      type: nodeType,
      group: layer,
      path: dir,
    });
    addedPaths.add(dir);
  }

  // 3. Add standalone important files not covered by directories
  const importantFiles = paths.filter((p) => {
    if (shouldSkip(p)) return false;
    const filename = p.split("/").pop() ?? "";
    return (
      filename === "package.json" ||
      filename === "Dockerfile" ||
      filename === "docker-compose.yml" ||
      filename === "main.py" ||
      filename === "main.ts" ||
      filename === "index.ts" ||
      filename === "index.js" ||
      filename === "app.py"
    );
  });

  for (const file of importantFiles) {
    // Skip if parent directory already covers this
    const parentDir = file.split("/").slice(0, -1).join("/");
    if (addedPaths.has(parentDir)) continue;
    if (addedPaths.has(file)) continue;

    const { nodeType, layer, style } = classifyPath(file);
    if (!groupSet.has(layer)) {
      groupSet.set(layer, { id: layer, label: layer, style });
    }

    components.push({
      id: toId(file),
      label: humanizeLabel(file, "file"),
      type: "file",
      group: layer,
      path: file,
    });
    addedPaths.add(file);
  }

  // 4. Add external services as nodes
  for (const [key, { label, group }] of externalServices) {
    if (!groupSet.has(group)) {
      groupSet.set(group, { id: group, label: group, style: "external" });
    }
    components.push({
      id: toId(key),
      label,
      type: "external",
      group,
    });
  }

  return {
    components,
    groups: [...groupSet.values()],
  };
}

// ── Helpers ───────────────────────────────────────────────────────

function classifyPath(path: string): { nodeType: GraphNodeType; layer: string; style: string } {
  const lower = path.toLowerCase() + "/";
  for (const lp of LAYER_PATTERNS) {
    for (const pattern of lp.patterns) {
      if (lower.startsWith(pattern) || lower.includes("/" + pattern)) {
        return { nodeType: lp.nodeType, layer: lp.layer, style: lp.style };
      }
    }
  }
  return { nodeType: "service", layer: "Core", style: "backend" };
}

function humanizeLabel(path: string, _nodeType: GraphNodeType): string {
  const lastSegment = path.split("/").filter(Boolean).pop() ?? path;
  // Remove file extensions but keep dotfiles (e.g., ".github" → "GitHub")
  let name = lastSegment;
  if (name.startsWith(".")) {
    // Dotfile/dotdir: strip leading dot
    name = name.slice(1);
  } else {
    // Regular file: strip extension
    name = name.replace(/\.[^.]+$/, "");
  }
  if (!name) name = lastSegment; // fallback to original if empty
  // Convert kebab-case / snake_case to Title Case
  return name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function shouldSkip(path: string): boolean {
  const lower = path.toLowerCase();
  return SKIP_PATTERNS.some((p) => lower.includes(p));
}

function buildSummary(readme: string, projectType: string, techStack: string[]): string {
  // Extract first meaningful paragraph from README
  const lines = readme.split("\n");
  let description = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("![") ||
      trimmed.startsWith("[![") ||
      trimmed.startsWith("---")
    ) {
      continue;
    }
    description = trimmed;
    break;
  }

  const typeLabel =
    PROJECT_INDICATORS[projectType]?.label ?? projectType;
  const stackStr = techStack.length > 0 ? ` using ${techStack.join(", ")}` : "";

  return `${typeLabel} project${stackStr}. ${description}`.slice(0, 500);
}

export function buildAnalyzerHints(analysis: RepoAnalysis): string {
  const lines: string[] = [];
  const typeLabel =
    PROJECT_INDICATORS[analysis.projectType]?.label ?? analysis.projectType;
  lines.push(`Project type: ${typeLabel}`);
  if (analysis.techStack.length > 0) {
    lines.push(`Tech stack: ${analysis.techStack.join(", ")}`);
  }
  if (analysis.externalServices.length > 0) {
    lines.push(`External services detected: ${analysis.externalServices.join(", ")}`);
  }
  return lines.join("\n");
}

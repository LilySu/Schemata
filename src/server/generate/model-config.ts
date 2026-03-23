const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";
const DEFAULT_FALLBACK_MODELS = ["google/gemini-2.5-flash"];

function readEnvValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getModel(): string {
  // Prefer new AI_MODEL, fall back to legacy OPENAI_MODEL
  const aiModel = readEnvValue("AI_MODEL");
  if (aiModel) return aiModel;

  const legacyModel = readEnvValue("OPENAI_MODEL");
  if (legacyModel) {
    // Auto-prefix with "openai/" if no provider prefix
    return legacyModel.includes("/") ? legacyModel : `openai/${legacyModel}`;
  }

  return DEFAULT_MODEL;
}

export function getFallbackModels(): string[] {
  const envFallbacks = readEnvValue("AI_FALLBACK_MODELS");
  if (envFallbacks) {
    return envFallbacks.split(",").map((m) => m.trim()).filter(Boolean);
  }
  return DEFAULT_FALLBACK_MODELS;
}

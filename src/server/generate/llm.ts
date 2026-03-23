import { streamText } from "ai";
import { resolveModel } from "./provider";
import { getFallbackModels } from "./model-config";

export type ReasoningEffort = "low" | "medium" | "high";

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface StreamCompletionParams {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  apiKey?: string;
  reasoningEffort?: ReasoningEffort;
  maxOutputTokens?: number;
}

function buildProviderOptions(reasoningEffort?: ReasoningEffort) {
  if (!reasoningEffort) return {};
  return {
    providerOptions: {
      openai: { reasoningEffort },
      anthropic: {
        thinking: {
          type: "enabled" as const,
          budgetTokens:
            reasoningEffort === "high"
              ? 10000
              : reasoningEffort === "medium"
                ? 5000
                : 2000,
        },
      },
    },
  };
}

export async function* streamCompletion({
  model,
  systemPrompt,
  userPrompt,
  apiKey,
  reasoningEffort,
  maxOutputTokens,
}: StreamCompletionParams): AsyncGenerator<string, void, void> {
  const fallbacks = getFallbackModels();
  const modelsToTry = [model, ...fallbacks];
  let lastError: Error | undefined;

  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i]!;
    console.log(`[llm] trying model ${currentModel} (attempt ${i + 1}/${modelsToTry.length})`);
    try {
      const result = streamText({
        model: resolveModel(currentModel, apiKey),
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens,
        ...buildProviderOptions(reasoningEffort),
      });

      let yieldCount = 0;
      for await (const chunk of result.textStream) {
        if (chunk) {
          yieldCount++;
          yield chunk;
        }
      }
      console.log(`[llm] model ${currentModel} completed, yielded ${yieldCount} chunks`);
      return; // Success — don't try fallbacks
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[llm] model ${currentModel} FAILED:`, lastError.message);
      if (i < modelsToTry.length - 1) {
        console.warn(
          `[llm] falling back to ${modelsToTry[i + 1]}`,
        );
      }
    }
  }

  throw lastError ?? new Error("All models failed.");
}

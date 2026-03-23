import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export function resolveModel(
  modelId: string,
  overrideApiKey?: string,
): LanguageModel {
  // AI Gateway mode: opt-in via USE_AI_GATEWAY=true
  const useGateway = process.env.USE_AI_GATEWAY?.trim() === "true";
  const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (useGateway && gatewayKey && !overrideApiKey) {
    const gateway = createOpenAICompatible({
      name: "ai-gateway",
      apiKey: gatewayKey,
      baseURL: "https://ai-gateway.vercel.sh/v1",
    });
    return gateway(modelId);
  }

  // Direct provider mode: parse "provider/model" format
  const [provider, ...rest] = modelId.split("/");
  const modelName = rest.join("/") || modelId;

  switch (provider) {
    case "anthropic":
      return createAnthropic({
        apiKey: overrideApiKey || process.env.ANTHROPIC_API_KEY,
      })(modelName);
    case "google":
      return createGoogleGenerativeAI({
        apiKey:
          overrideApiKey ||
          process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
          process.env.GOOGLE_API_KEY,
      })(modelName);
    case "openai":
    default:
      return createOpenAI({
        apiKey: overrideApiKey || process.env.OPENAI_API_KEY,
      })(provider === "openai" ? modelName : modelId);
  }
}

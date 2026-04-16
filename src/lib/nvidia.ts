// ─── Types ───────────────────────────────────────────────

export type LLMProvider = "nvidia" | "groq";

export interface LLMModel {
  id: string;
  provider: LLMProvider;
  name: string;
  description: string;
  contextLength: string;
  speed: "fast" | "medium" | "slow"; // visual hint
}

export interface ProviderInfo {
  id: LLMProvider;
  name: string;
  icon: string;
  description: string;
}

// ─── Providers ───────────────────────────────────────────

export const PROVIDERS: ProviderInfo[] = [
  { id: "groq", name: "Groq", icon: "⚡", description: "超低延迟推理" },
  { id: "nvidia", name: "NVIDIA", icon: "🟢", description: "高质量生成" },
];

// ─── Models ──────────────────────────────────────────────

// Groq models (available when GROQ_API_KEY is properly configured)
export const GROQ_MODELS: LLMModel[] = [
  {
    id: "llama-3.3-70b-versatile",
    provider: "groq",
    name: "Llama 3.3 70B",
    description: "Meta 最新通用模型，综合能力极强",
    contextLength: "128K",
    speed: "fast",
  },
  {
    id: "llama-3.1-8b-instant",
    provider: "groq",
    name: "Llama 3.1 8B Instant",
    description: "超低延迟，响应极快",
    contextLength: "128K",
    speed: "fast",
  },
  {
    id: "llama-3.1-70b-versatile",
    provider: "groq",
    name: "Llama 3.1 70B Versatile",
    description: "平衡型，质量与速度兼备",
    contextLength: "128K",
    speed: "fast",
  },
  {
    id: "mixtral-8x7b-32768",
    provider: "groq",
    name: "Mixtral 8x7B",
    description: "Mistral MoE 架构，32K 上下文",
    contextLength: "32K",
    speed: "fast",
  },
  {
    id: "gemma2-9b-it",
    provider: "groq",
    name: "Gemma 2 9B",
    description: "Google 轻量级模型",
    contextLength: "8K",
    speed: "fast",
  },
  {
    id: "deepseek-r1-distill-llama-70b",
    provider: "groq",
    name: "DeepSeek R1 Distill 70B",
    description: "推理模型，逻辑思维极强",
    contextLength: "128K",
    speed: "fast",
  },
];

export const NVIDIA_MODELS: LLMModel[] = [
  {
    id: "meta/llama-3.1-405b-instruct",
    provider: "nvidia",
    name: "Llama 3.1 405B",
    description: "Meta 最大最强开源模型",
    contextLength: "128K",
    speed: "slow",
  },
  {
    id: "meta/llama-3.1-70b-instruct",
    provider: "nvidia",
    name: "Llama 3.1 70B",
    description: "平衡型，速度与质量兼备",
    contextLength: "128K",
    speed: "medium",
  },
  {
    id: "nvidia/llama-3.1-nemotron-70b-instruct",
    provider: "nvidia",
    name: "Nemotron 70B",
    description: "NVIDIA 微调版，中文优秀",
    contextLength: "128K",
    speed: "medium",
  },
  {
    id: "deepseek-ai/deepseek-r1",
    provider: "nvidia",
    name: "DeepSeek R1",
    description: "推理模型，逻辑极强",
    contextLength: "128K",
    speed: "medium",
  },
  {
    id: "mistralai/mixtral-8x22b-instruct-v0.1",
    provider: "nvidia",
    name: "Mixtral 8x22B",
    description: "Mistral MoE，高效推理",
    contextLength: "64K",
    speed: "medium",
  },
  {
    id: "google/gemma-2-27b-it",
    provider: "nvidia",
    name: "Gemma 2 27B",
    description: "Google 轻量模型",
    contextLength: "8K",
    speed: "medium",
  },
];

export const ALL_MODELS = [...GROQ_MODELS, ...NVIDIA_MODELS];

// Default: NVIDIA Llama 3.1 70B
export const DEFAULT_MODEL = `${NVIDIA_MODELS[1].provider}:${NVIDIA_MODELS[1].id}`;

// ─── Helpers ─────────────────────────────────────────────

/** Parse "provider:modelId" → { provider, modelId } */
export function parseModelKey(key: string): { provider: LLMProvider; modelId: string } {
  const idx = key.indexOf(":");
  if (idx === -1) {
    // Legacy: no provider prefix, assume nvidia
    return { provider: "nvidia", modelId: key };
  }
  return {
    provider: key.slice(0, idx) as LLMProvider,
    modelId: key.slice(idx + 1),
  };
}

/** Build "provider:modelId" */
export function buildModelKey(provider: LLMProvider, modelId: string): string {
  return `${provider}:${modelId}`;
}

/** Find model object by key */
export function findModel(key: string): LLMModel | undefined {
  const { provider, modelId } = parseModelKey(key);
  return ALL_MODELS.find((m) => m.provider === provider && m.id === modelId);
}

// ─── API Callers (OpenAI-compatible) ─────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function getBaseUrl(provider: LLMProvider): string {
  switch (provider) {
    case "groq":
      return "https://api.groq.com/openai/v1";
    case "nvidia":
      return "https://integrate.api.nvidia.com/v1";
  }
}

function getApiKey(provider: LLMProvider): string {
  switch (provider) {
    case "groq":
      return process.env.GROQ_API_KEY || "";
    case "nvidia":
      return process.env.NVIDIA_API_KEY || "";
  }
}

/**
 * Call an OpenAI-compatible API with streaming.
 * Returns the raw ReadableStream of SSE chunks.
 */
export async function createStream(
  messages: ChatMessage[],
  modelKey: string
): Promise<ReadableStream<Uint8Array>> {
  const { provider, modelId } = parseModelKey(modelKey);
  const apiKey = getApiKey(provider);
  if (!apiKey) {
    throw new Error(`${provider.toUpperCase()}_API_KEY is not configured`);
  }

  const baseUrl = getBaseUrl(provider);

  const body: Record<string, unknown> = {
    model: modelId,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 2048,
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${provider.toUpperCase()} API Error]`, response.status, errorText);
    throw new Error(
      `${provider.toUpperCase()} API error ${response.status}: ${errorText.slice(0, 200)}`
    );
  }

  if (!response.body) {
    throw new Error(`${provider.toUpperCase()} API returned empty body`);
  }

  return response.body;
}

/**
 * Call API without streaming (fallback).
 */
export async function createCompletion(
  messages: ChatMessage[],
  modelKey: string
): Promise<string> {
  const { provider, modelId } = parseModelKey(modelKey);
  const apiKey = getApiKey(provider);
  if (!apiKey) {
    throw new Error(`${provider.toUpperCase()}_API_KEY is not configured`);
  }

  const baseUrl = getBaseUrl(provider);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${provider.toUpperCase()} API Error]`, response.status, errorText);
    throw new Error(
      `${provider.toUpperCase()} API error ${response.status}: ${errorText.slice(0, 200)}`
    );
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

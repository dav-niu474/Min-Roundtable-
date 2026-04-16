export interface NVIDIAModel {
  id: string;
  name: string;
  description: string;
  contextLength: string;
}

export const NVIDIA_MODELS: NVIDIAModel[] = [
  {
    id: "meta/llama-3.1-405b-instruct",
    name: "Llama 3.1 405B",
    description: "Meta 最大最强开源模型，综合能力顶级",
    contextLength: "128K",
  },
  {
    id: "meta/llama-3.1-70b-instruct",
    name: "Llama 3.1 70B",
    description: "Meta 平衡型模型，速度与质量兼备",
    contextLength: "128K",
  },
  {
    id: "nvidia/llama-3.1-nemotron-70b-instruct",
    name: "Nemotron 70B",
    description: "NVIDIA 微调 Llama，中文能力优秀",
    contextLength: "128K",
  },
  {
    id: "mistralai/mixtral-8x22b-instruct-v0.1",
    name: "Mixtral 8x22B",
    description: "Mistral MoE 架构，高效推理",
    contextLength: "64K",
  },
  {
    id: "google/gemma-2-27b-it",
    name: "Gemma 2 27B",
    description: "Google 轻量模型，速度快",
    contextLength: "8K",
  },
  {
    id: "microsoft/phi-3-mini-128k-instruct",
    name: "Phi-3 Mini",
    description: "Microsoft 小型模型，128K 长上下文",
    contextLength: "128K",
  },
  {
    id: "nvidia/nemotron-4-340b-instruct",
    name: "Nemotron 4 340B",
    description: "NVIDIA 自研大模型，指令遵循优秀",
    contextLength: "4K",
  },
  {
    id: "deepseek-ai/deepseek-r1",
    name: "DeepSeek R1",
    description: "深度求索推理模型，逻辑推理极强",
    contextLength: "128K",
  },
];

export const DEFAULT_MODEL = NVIDIA_MODELS[0].id;

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Call NVIDIA NIM API (OpenAI-compatible) with streaming.
 * Returns a ReadableStream of SSE chunks.
 */
export async function createNVIDIAStream(
  messages: ChatMessage[],
  model: string = DEFAULT_MODEL,
  apiKey?: string
): Promise<ReadableStream<Uint8Array>> {
  const key = apiKey || process.env.NVIDIA_API_KEY;
  if (!key) {
    throw new Error("NVIDIA_API_KEY is not configured");
  }

  const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
      max_tokens: 2048,
      temperature: 0.7,
      top_p: 0.9,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[NVIDIA API Error]", response.status, errorText);
    throw new Error(
      `NVIDIA API error ${response.status}: ${errorText.slice(0, 200)}`
    );
  }

  if (!response.body) {
    throw new Error("NVIDIA API returned empty body");
  }

  return response.body;
}

/**
 * Call NVIDIA NIM API without streaming (fallback).
 */
export async function createNVIDIACompletion(
  messages: ChatMessage[],
  model: string = DEFAULT_MODEL,
  apiKey?: string
): Promise<string> {
  const key = apiKey || process.env.NVIDIA_API_KEY;
  if (!key) {
    throw new Error("NVIDIA_API_KEY is not configured");
  }

  const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      max_tokens: 2048,
      temperature: 0.7,
      top_p: 0.9,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[NVIDIA API Error]", response.status, errorText);
    throw new Error(
      `NVIDIA API error ${response.status}: ${errorText.slice(0, 200)}`
    );
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

import { NextRequest } from "next/server";
import { getPersonalitiesByIds } from "@/lib/personalities";
import { createNVIDIAStream, createNVIDIACompletion, DEFAULT_MODEL } from "@/lib/nvidia";

export const runtime = "nodejs";

const MAX_HISTORY_MESSAGES = 20;

interface RoundtableMessage {
  role: "user" | "assistant";
  content: string;
  personalityId?: string;
}

interface RoundtableRequest {
  personalityIds: string[];
  message: string;
  history: RoundtableMessage[];
  model?: string;
}

async function* streamPersonalityResponse(
  systemPrompt: string,
  roundtableInstruction: string,
  history: RoundtableMessage[],
  userMessage: string,
  model: string
): AsyncGenerator<string> {
  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);

  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    {
      role: "system",
      content: `${systemPrompt}\n\n${roundtableInstruction}`,
    },
    ...trimmedHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  try {
    const upstreamStream = await createNVIDIAStream(messages, model);
    const decoder = new TextDecoder();
    const reader = upstreamStream.getReader();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;

          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") continue;

          try {
            const parsed = JSON.parse(payload);
            const content = parsed?.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }

      // Flush remaining
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith("data:")) {
          const payload = trimmed.slice(5).trim();
          if (payload !== "[DONE]") {
            try {
              const parsed = JSON.parse(payload);
              const content = parsed?.choices?.[0]?.delta?.content;
              if (content) {
                yield content;
              }
            } catch {
              // Skip
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch {
    // Fallback to non-streaming
    const text = await createNVIDIACompletion(messages, model);
    yield text;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: RoundtableRequest = await req.json();
    const { personalityIds, message, history = [], model } = body;

    if (
      !Array.isArray(personalityIds) ||
      personalityIds.length < 2 ||
      personalityIds.some((id) => typeof id !== "string")
    ) {
      return new Response(
        JSON.stringify({
          error: "personalityIds must be an array of at least 2 personality IDs",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "message is required and must be non-empty" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const personalities = getPersonalitiesByIds(personalityIds);
    if (personalities.length < 2) {
      return new Response(
        JSON.stringify({
          error:
            "At least 2 valid personalities are required for a roundtable discussion",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const otherNames = personalities.map((p) => p.name).filter(Boolean).join("、");

    const roundtableInstruction = `你正在参加一个圆桌讨论。其他参与者包括${otherNames}。请先简要回应其他人的观点（如果有），然后用你自己的思维框架回答用户的问题。保持简洁，不超过300字。`;

    const selectedModel = model || DEFAULT_MODEL;
    const encoder = new TextEncoder();

    const ndjsonStream = new ReadableStream({
      async start(controller) {
        try {
          for (const personality of personalities) {
            const generator = streamPersonalityResponse(
              personality.systemPrompt,
              roundtableInstruction,
              history,
              message,
              selectedModel
            );

            for await (const chunk of generator) {
              const line = JSON.stringify({
                personalityId: personality.id,
                content: chunk,
              });
              controller.enqueue(encoder.encode(`${line}\n`));
            }
          }

          controller.enqueue(
            encoder.encode(`${JSON.stringify({ type: "done" })}\n`)
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Stream interrupted";
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({ type: "error", error: errorMessage })}\n`
            )
          );
          controller.enqueue(
            encoder.encode(`${JSON.stringify({ type: "done" })}\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(ndjsonStream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("[Roundtable API Error]", message);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

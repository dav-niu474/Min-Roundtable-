import { NextRequest } from "next/server";
import { getPersonality } from "@/lib/personalities";
import { createStream, createCompletion, DEFAULT_MODEL } from "@/lib/nvidia";

export const runtime = "nodejs";

const MAX_HISTORY_MESSAGES = 20;

interface ChatRequest {
  personalityId: string;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: ChatRequest = await req.json();
    const { personalityId, message, history = [], model } = body;

    if (!personalityId || typeof personalityId !== "string") {
      return new Response(JSON.stringify({ error: "personalityId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "message is required and must be non-empty" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const personality = getPersonality(personalityId);
    if (!personality) {
      return new Response(
        JSON.stringify({ error: `Personality "${personalityId}" not found` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);

    // 对话设定：你是你自己，不是AI助手
    const dialogueInstruction = `

你现在在和一个活人聊天。对方刚说了一句话，你听到了。
不是让你"回答问题"——没人给你出题。你就像平时跟朋友聊天一样，听到了对方的话，你自然地回应。
该追问就追问，该反对就反对，该反问就反问。
不列举要点，不说套话。说你自己真正想说的话。`;

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: `${personality.systemPrompt}${dialogueInstruction}` },
      ...trimmedHistory.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    const selectedModel = model || DEFAULT_MODEL;

    // Try streaming first
    try {
      const upstreamStream = await createStream(messages, selectedModel);

      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const transformedStream = new ReadableStream({
        async start(controller) {
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
                if (payload === "[DONE]") {
                  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                  continue;
                }

                try {
                  const parsed = JSON.parse(payload);
                  const content = parsed?.choices?.[0]?.delta?.content;
                  if (content) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                    );
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
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                      );
                    }
                  } catch {
                    // Skip
                  }
                }
              }
            }

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Stream interrupted";
            console.error("[Chat stream error]", errorMessage);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: errorMessage })}\n\n`
              )
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(transformedStream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch {
      // Fallback to non-streaming
      const text = await createCompletion(messages, selectedModel);
      const encoder = new TextEncoder();
      const fallbackStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`)
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(fallbackStream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("[Chat API Error]", message);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

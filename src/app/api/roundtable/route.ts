import { NextRequest } from "next/server";
import { getPersonalitiesByIds, getPersonality } from "@/lib/personalities";
import { createStream, createCompletion, DEFAULT_MODEL } from "@/lib/nvidia";

export const runtime = "nodejs";

const MAX_HISTORY_MESSAGES = 50;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  personalityId?: string;
  personalityName?: string;
}

interface SpeakRequest {
  personalityId: string;       // 谁来发言
  personalityIds: string[];    // 圆桌成员列表
  message: string;             // 用户触发这条回复的消息
  history: ChatMessage[];      // 完整对话历史（含所有人之前的发言）
  model?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: SpeakRequest = await req.json();
    const { personalityId, personalityIds, message, history = [], model } = body;

    if (!personalityId || !personalityIds || !Array.isArray(personalityIds)) {
      return new Response(
        JSON.stringify({ error: "personalityId and personalityIds are required" }),
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

    const allMembers = getPersonalitiesByIds(personalityIds);
    const others = allMembers.filter(p => p.id !== personalityId);
    const otherNames = others.map(p => p.name).join("、");

    // 把完整历史拼成一个对话实录，作为agent的上下文输入
    const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);

    // 构建对话实录 —— 所有人说过的话
    const transcript = trimmedHistory
      .filter(m => m.content)
      .map(m => {
        if (m.role === "user") {
          return `【提问者】：${m.content}`;
        }
        const name = m.personalityName || "某人";
        return `【${name}】：${m.content}`;
      })
      .join("\n\n");

    const systemPrompt = `${personality.systemPrompt}

## 你现在的处境

你在一张圆桌前坐着。${otherNames ? `和你一起的还有：${otherNames}。` : ""}${transcript ? `

你们之前已经聊了这些：

${transcript}` : ""}

${message ? `刚才有人说了：\n「${message}」` : ""}

现在轮到你开口了。你是你自己，${personality.name}。按你最自然的方式回应。
你不需要回应所有内容——选你最有感触的点说。该反对就反对，该追问就追问，该补充就补充。
就像真实的圆桌讨论一样，想到什么说什么，用你自己的声音。`;

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    // 不再把历史作为 messages 塞入（已经在 system prompt 的实录里了）
    // 但保留最近几轮作为对话上下文，帮助模型理解对话节奏
    const recentMessages = trimmedHistory.slice(-10);
    for (const msg of recentMessages) {
      if (msg.role === "user") {
        messages.push({ role: "user", content: msg.content });
      } else {
        messages.push({ role: "assistant", content: msg.content });
      }
    }

    const selectedModel = model || DEFAULT_MODEL;

    // 尝试真实流式输出
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
                  // skip
                }
              }
            }

            if (buffer.trim()) {
              const t = buffer.trim();
              if (t.startsWith("data:")) {
                const payload = t.slice(5).trim();
                if (payload !== "[DONE]") {
                  try {
                    const parsed = JSON.parse(payload);
                    const content = parsed?.choices?.[0]?.delta?.content;
                    if (content) {
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                      );
                    }
                  } catch { /* skip */ }
                }
              }
            }

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Stream interrupted";
            console.error("[Roundtable speak stream error]", errorMessage);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: errorMessage })}\n\n`)
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
      // 降级到非流式
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
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[Roundtable speak error]", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

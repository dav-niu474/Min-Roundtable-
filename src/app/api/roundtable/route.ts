import { NextRequest } from "next/server";
import { getPersonalitiesByIds } from "@/lib/personalities";
import { createStream, createCompletion, DEFAULT_MODEL } from "@/lib/nvidia";

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

/**
 * Call the LLM and collect the FULL response as a string.
 * Used to build context for subsequent speakers.
 */
async function getFullResponse(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  modelKey: string
): Promise<string> {
  try {
    return await createCompletion(messages, modelKey);
  } catch {
    throw new Error("Completion failed");
  }
}

/**
 * Call the LLM with streaming and return an async generator of content chunks.
 */
async function* streamResponse(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  modelKey: string
): AsyncGenerator<string> {
  const upstreamStream = await createStream(messages, modelKey);
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
          if (content) yield content;
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
            if (content) yield content;
          } catch { /* skip */ }
        }
      }
    }
  } finally {
    reader.releaseLock();
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
        JSON.stringify({ error: "personalityIds must be an array of at least 2 personality IDs" }),
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
        JSON.stringify({ error: "At least 2 valid personalities are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const selectedModel = model || DEFAULT_MODEL;
    const encoder = new TextEncoder();
    const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);

    // ═══════════════════════════════════════════════════════════
    // CHAIN DISCUSSION: Each speaker sees ALL previous responses
    // to create genuine intellectual collision (思维碰撞)
    // ═══════════════════════════════════════════════════════════

    const ndjsonStream = new ReadableStream({
      async start(controller) {
        // Accumulated context: each speaker's full response
        const speakerResponses: Array<{ name: string; content: string }> = [];

        try {
          for (let i = 0; i < personalities.length; i++) {
            const personality = personalities[i];
            const isFirst = i === 0;

            // ── Build discussion context from previous speakers ──
            let contextBlock = "";
            if (!isFirst) {
              const transcript = speakerResponses
                .map((s) => `【${s.name}】${s.content}`)
                .join("\n\n");

              contextBlock = `
---

## 💬 圆桌讨论实录（请先阅读）

${transcript}

---

### 你的任务
你听到了上面所有人的发言。现在请：
1. **回应**你最想互动的一到两个观点（赞同、反驳或补充都可以）
2. **展开**你自己的独特见解——用你的核心思维框架分析这个问题
3. 可以犀利、可以反对——思想碰撞需要真实观点，不要和稀泥
4. 保持 200-300 字，不要长篇大论`;
            } else {
              contextBlock = `
### 你的任务
你是第一个发言的。请：
1. 率先抛出你最有力的核心观点，为整场讨论定调
2. 不要面面俱到——给出你最独特的一个洞见
3. 保持 200-300 字`;
            }

            const otherNames = personalities
              .filter((p) => p.id !== personality.id)
              .map((p) => p.name)
              .join("、");

            const systemPrompt = `${personality.systemPrompt}

## 当前场景
你正在参加一场高水平圆桌思想讨论，参与者包括：${otherNames}。
这不是一问一答——这是一场真正的思想碰撞。认真对待其他参与者的观点。

## 发言规则
- 用"我"的身份直接发言
- 带着你独特的思维框架和视角
- 可以犀利、有攻击性——真正有价值的讨论需要冲突
- 不要说废话和客套话
${contextBlock}`;

            // ── Build message array ──
            const messages: Array<{
              role: "system" | "user" | "assistant";
              content: string;
            }> = [{ role: "system", content: systemPrompt }];

            for (const msg of trimmedHistory) {
              messages.push({
                role: msg.role as "user" | "assistant",
                content: msg.content,
              });
            }
            messages.push({ role: "user", content: message });

            // ── Signal: this personality starts speaking ──
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "turn_start",
                  personalityId: personality.id,
                  personalityName: personality.name,
                  turnIndex: i,
                  totalTurns: personalities.length,
                }) + "\n"
              )
            );

            // ── Get full response for context, then stream to client ──
            // Strategy: non-streaming call to get full text, then "fake stream" it to client.
            // This ensures we have the complete response for the next speaker's context.
            let fullText = "";
            try {
              fullText = await getFullResponse(messages, selectedModel);
            } catch {
              // Fallback to streaming + collecting
              try {
                const chunks: string[] = [];
                const gen = streamResponse(messages, selectedModel);
                for await (const chunk of gen) {
                  chunks.push(chunk);
                }
                fullText = chunks.join("");
              } catch (innerErr) {
                const errMsg = innerErr instanceof Error ? innerErr.message : "Unknown error";
                fullText = `⚠️ 发言失败：${errMsg}`;
                console.error(`[Roundtable] Both streaming and completion failed for ${personality.id}`, errMsg);
              }
            }

            // Stream the collected text to the client in small chunks for a natural feel
            const chunkSize = Math.max(2, Math.floor(fullText.length / 40));
            for (let c = 0; c < fullText.length; c += chunkSize) {
              const chunk = fullText.slice(c, c + chunkSize);
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ personalityId: personality.id, content: chunk }) + "\n"
                )
              );
              // Small delay between chunks for natural streaming feel
              await new Promise((r) => setTimeout(r, 15));
            }

            // ── Signal: this personality finished ──
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "turn_end", personalityId: personality.id }) + "\n"
              )
            );

            // ── Save response for next speaker's context ──
            if (fullText && !fullText.startsWith("⚠️")) {
              speakerResponses.push({ name: personality.name, content: fullText });
            }
          }

          // All speakers done
          controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Stream interrupted";
          console.error("[Roundtable API Error]", errorMessage);
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "error", error: errorMessage }) + "\n")
          );
          controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
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
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[Roundtable API Error]", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

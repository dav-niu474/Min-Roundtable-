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
  mode?: string;
  hotSeatId?: string; // for hotseat mode
}

// ─── Helpers ───────────────────────────────────────────────

async function getFullResponse(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  modelKey: string
): Promise<string> {
  return await createCompletion(messages, modelKey);
}

function getOtherNames(personalities: { id: string; name: string }[], excludeId?: string): string {
  return personalities
    .filter((p) => p.id !== excludeId)
    .map((p) => p.name)
    .join("、");
}

// ─── Mode: Chain Collision (链式碰撞) ─────────────────────

async function* runChainMode(
  personalities: Awaited<ReturnType<typeof getPersonalitiesByIds>>,
  userMessage: string,
  history: RoundtableMessage[],
  modelKey: string,
) {
  const speakerResponses: Array<{ name: string; content: string }> = [];

  for (let i = 0; i < personalities.length; i++) {
    const p = personalities[i];
    const isFirst = i === 0;

    let contextBlock = "";
    if (!isFirst) {
      const transcript = speakerResponses.map((s) => `【${s.name}】${s.content}`).join("\n\n");
      contextBlock = `
## 💬 圆桌讨论实录（请先阅读）

${transcript}

### 你的任务
你听到了上面所有人的发言。现在请：
1. **回应**你最想互动的一到两个观点（赞同、反驳或补充都可以）
2. **展开**你自己的独特见解——用你的核心思维框架分析这个问题
3. 可以犀利、可以反对——思想碰撞需要真实观点，不要和稀泥
4. 保持 200-300 字`;
    } else {
      contextBlock = `你是第一个发言的。请率先抛出你最有力的核心观点，为整场讨论定调。不要面面俱到，给出你最独特的一个洞见。200-300字。`;
    }

    const systemPrompt = `${p.systemPrompt}

## 当前场景
你正在参加一场链式思想碰撞讨论。参与者：${getOtherNames(personalities, p.id)}。

## 发言规则
- 用"我"的身份直接发言，不要"XX认为"
- 带着你独特的思维框架和视角
- 可以犀利、有攻击性——真正有价值的讨论需要冲突
- 不要说废话和客套话
${contextBlock}`;

    const messages = buildMessages(systemPrompt, history, userMessage);

    yield { type: "turn_start" as const, personalityId: p.id, personalityName: p.name, turnIndex: i, totalTurns: personalities.length };

    const fullText = await safeComplete(messages, modelKey, p.name);
    yield { type: "stream_text" as const, personalityId: p.id, text: fullText };

    yield { type: "turn_end" as const, personalityId: p.id };

    if (!fullText.startsWith("⚠️")) {
      speakerResponses.push({ name: p.name, content: fullText });
    }
  }
}

// ─── Mode: Debate (辩论对抗) ───────────────────────────────

async function* runDebateMode(
  personalities: Awaited<ReturnType<typeof getPersonalitiesByIds>>,
  userMessage: string,
  history: RoundtableMessage[],
  modelKey: string,
) {
  // Split into two teams
  const mid = Math.ceil(personalities.length / 2);
  const proTeam = personalities.slice(0, mid);
  const conTeam = personalities.slice(mid);
  const proNames = proTeam.map((p) => p.name).join("、");
  const conNames = conTeam.map((p) => p.name).join("、");

  const rounds = [
    { name: "立论", desc: "陈述你的核心论点" },
    { name: "驳论", desc: "反驳对方的论点，加固己方立场" },
    { name: "结辩", desc: "总结陈词，给出最终立场" },
  ];

  const allTeamContext: Array<{ name: string; team: "pro" | "con"; content: string }> = [];

  for (let round = 0; round < rounds.length; round++) {
    yield { type: "round_start" as const, round, roundName: rounds[round].name, roundDesc: rounds[round].desc };

    // Pro team speaks
    for (const p of proTeam) {
      const teamTranscript = allTeamContext
        .filter((c) => c.team === "pro")
        .map((c) => `【${c.name}】${c.content}`)
        .join("\n\n");
      const oppTranscript = allTeamContext
        .filter((c) => c.team === "con")
        .map((c) => `【${c.name}】${c.content}`)
        .join("\n\n");

      const systemPrompt = `${p.systemPrompt}

## 辩论场景
议题：${userMessage}

你的立场：**正方**（支持/赞成）
你的队友：${proNames}
反方：${conNames}
当前轮次：${rounds[round].name} — ${rounds[round].desc}

${teamTranscript ? `## 己方发言记录\n${teamTranscript}\n` : ""}
${oppTranscript ? `## 反方发言记录\n${oppTranscript}\n` : ""}
## 规则
- 你是正方，立场鲜明
- 用你的思维框架构建论据
- ${round === 1 ? "重点反驳反方的论点" : round === 2 ? "总结全文，给出最强有力的结尾" : "抛出你的核心论点"}
- 保持 150-250 字`;

      yield { type: "turn_start" as const, personalityId: p.id, personalityName: p.name, turnIndex: allTeamContext.length, totalTurns: personalities.length * 3, meta: { team: "pro", round: rounds[round].name } };

      const fullText = await safeComplete(buildMessages(systemPrompt, history, ""), modelKey, p.name);
      yield { type: "stream_text" as const, personalityId: p.id, text: fullText };
      yield { type: "turn_end" as const, personalityId: p.id };
      allTeamContext.push({ name: p.name, team: "pro", content: fullText });
    }

    // Con team speaks
    for (const p of conTeam) {
      const teamTranscript = allTeamContext
        .filter((c) => c.team === "con")
        .map((c) => `【${c.name}】${c.content}`)
        .join("\n\n");
      const oppTranscript = allTeamContext
        .filter((c) => c.team === "pro")
        .map((c) => `【${c.name}】${c.content}`)
        .join("\n\n");

      const systemPrompt = `${p.systemPrompt}

## 辩论场景
议题：${userMessage}

你的立场：**反方**（反对/质疑）
你的队友：${conNames}
正方：${proNames}
当前轮次：${rounds[round].name} — ${rounds[round].desc}

${teamTranscript ? `## 己方发言记录\n${teamTranscript}\n` : ""}
${oppTranscript ? `## 正方发言记录\n${oppTranscript}\n` : ""}
## 规则
- 你是反方，立场鲜明
- 用你的思维框架构建论据
- ${round === 1 ? "重点反驳正方的论点" : round === 2 ? "总结全文，给出最强有力的结尾" : "抛出你的核心论点"}
- 保持 150-250 字`;

      yield { type: "turn_start" as const, personalityId: p.id, personalityName: p.name, turnIndex: allTeamContext.length, totalTurns: personalities.length * 3, meta: { team: "con", round: rounds[round].name } };

      const fullText = await safeComplete(buildMessages(systemPrompt, history, ""), modelKey, p.name);
      yield { type: "stream_text" as const, personalityId: p.id, text: fullText };
      yield { type: "turn_end" as const, personalityId: p.id };
      allTeamContext.push({ name: p.name, team: "con", content: fullText });
    }

    yield { type: "round_end" as const, round, roundName: rounds[round].name };
  }
}

// ─── Mode: Hot Seat (热座挑战) ────────────────────────────

async function* runHotSeatMode(
  personalities: Awaited<ReturnType<typeof getPersonalitiesByIds>>,
  userMessage: string,
  history: RoundtableMessage[],
  modelKey: string,
  hotSeatId: string,
) {
  const hotSeat = personalities.find((p) => p.id === hotSeatId) || personalities[0];
  const challengers = personalities.filter((p) => p.id !== hotSeatId);
  const challengerNames = challengers.map((c) => c.name).join("、");

  // Phase 1: Hot seat opening statement
  yield { type: "phase_start" as const, phase: "opening", phaseName: "热座陈述", description: `${hotSeat.name} 先阐述核心观点` };

  const hotSeatSystemPrompt = `${hotSeat.systemPrompt}

## 场景
你坐在「热座」上，话题是：${userMessage}
接下来会有 ${challengerNames} 依次对你发起挑战。

## 你的任务
先用 200-300 字阐述你关于这个话题的核心观点和立场。要鲜明、有力量，让挑战者有明确的目标可以攻击。`;

  yield { type: "turn_start" as const, personalityId: hotSeat.id, personalityName: hotSeat.name, turnIndex: 0, totalTurns: challengers.length + 2, meta: { phase: "opening" } };

  const openingText = await safeComplete(buildMessages(hotSeatSystemPrompt, history, userMessage), modelKey, hotSeat.name);
  yield { type: "stream_text" as const, personalityId: hotSeat.id, text: openingText };
  yield { type: "turn_end" as const, personalityId: hotSeat.id };

  // Phase 2: Challenges
  yield { type: "phase_start" as const, phase: "challenge", phaseName: "轮番挑战", description: "每位挑战者质疑热座人物的观点" };

  const challenges: Array<{ name: string; content: string }> = [];

  for (let i = 0; i < challengers.length; i++) {
    const challenger = challengers[i];
    const prevChallenges = challenges.map((c) => `【${c.name}】${c.content}`).join("\n\n");

    const systemPrompt = `${challenger.systemPrompt}

## 场景
${hotSeat.name} 坐在热座上，刚才说了：
"${openingText}"

话题：${userMessage}

${prevChallenges ? `## 其他挑战者已经说了\n${prevChallenges}\n\n` : ""}
## 你的任务
用你最犀利的思维框架，质疑 ${hotSeat.name} 的观点中的薄弱环节。200-250字。`;

    yield { type: "turn_start" as const, personalityId: challenger.id, personalityName: challenger.name, turnIndex: i + 1, totalTurns: challengers.length + 2, meta: { phase: "challenge" } };

    const challengeText = await safeComplete(buildMessages(systemPrompt, history, ""), modelKey, challenger.name);
    yield { type: "stream_text" as const, personalityId: challenger.id, text: challengeText };
    yield { type: "turn_end" as const, personalityId: challenger.id };
    challenges.push({ name: challenger.name, content: challengeText });
  }

  // Phase 3: Hot seat response
  yield { type: "phase_start" as const, phase: "response", phaseName: "热座回应", description: `${hotSeat.name} 回应所有挑战` };

  const allChallenges = challenges.map((c) => `【${c.name}】${c.content}`).join("\n\n");

  const responsePrompt = `${hotSeat.systemPrompt}

## 场景
你坐在热座上。之前你说了：
"${openingText}"

然后 ${challengerNames} 对你发起了以下挑战：

${allChallenges}

## 你的任务
回应这些挑战。你可以：
- 承认有道理的部分，修正你的观点
- 反驳错误的质疑
- 深化你原来的论点
不要和稀泥，该坚持就坚持，该认错就认错。200-300字。`;

  yield { type: "turn_start" as const, personalityId: hotSeat.id, personalityName: hotSeat.name, turnIndex: challengers.length + 1, totalTurns: challengers.length + 2, meta: { phase: "response" } };

  const responseText = await safeComplete(buildMessages(responsePrompt, history, ""), modelKey, hotSeat.name);
  yield { type: "stream_text" as const, personalityId: hotSeat.id, text: responseText };
  yield { type: "turn_end" as const, personalityId: hotSeat.id };
  yield { type: "phase_end" as const };
}

// ─── Mode: Mentor Consult (导师会诊) ─────────────────────

async function* runConsultMode(
  personalities: Awaited<ReturnType<typeof getPersonalitiesByIds>>,
  userMessage: string,
  history: RoundtableMessage[],
  modelKey: string,
) {
  const mentorNames = personalities.map((p) => p.name).join("、");

  // Phase 1: Independent diagnosis
  yield { type: "phase_start" as const, phase: "diagnosis", phaseName: "独立诊断", description: "每位导师给出诊断和建议" };

  const diagnoses: Array<{ name: string; content: string }> = [];

  for (let i = 0; i < personalities.length; i++) {
    const p = personalities[i];

    const systemPrompt = `${p.systemPrompt}

## 场景
有人向你求助：
"${userMessage}"

其他也会给出建议的导师：${mentorNames}

## 你的任务
用你的思维框架独立诊断这个问题。给出：
1. 你认为问题的本质是什么？
2. 你的核心建议是什么？
3. 大多数人会忽略的关键点是什么？
200-250 字。独立思考，不要参考其他导师的意见（他们还没发言）。`;

    yield { type: "turn_start" as const, personalityId: p.id, personalityName: p.name, turnIndex: i, totalTurns: personalities.length * 2 };

    const diagText = await safeComplete(buildMessages(systemPrompt, history, userMessage), modelKey, p.name);
    yield { type: "stream_text" as const, personalityId: p.id, text: diagText };
    yield { type: "turn_end" as const, personalityId: p.id };
    diagnoses.push({ name: p.name, content: diagText });
  }

  // Phase 2: Cross-review
  yield { type: "phase_start" as const, phase: "review", phaseName: "交叉点评", description: "导师们互相评价对方方案" };

  const allDiagnoses = diagnoses.map((d) => `【${d.name}】${d.content}`).join("\n\n");

  for (let i = 0; i < personalities.length; i++) {
    const p = personalities[i];

    const systemPrompt = `${p.systemPrompt}

## 场景
原始问题：${userMessage}

以下是所有导师的独立诊断：

${allDiagnoses}

## 你的任务
你现在看到了所有人的诊断。请：
1. 你最赞同谁的观点？为什么？
2. 你最反对谁的观点？盲区在哪里？
3. 综合来看，你认为最优解是什么？
150-200 字。`;

    yield { type: "turn_start" as const, personalityId: p.id, personalityName: p.name, turnIndex: personalities.length + i, totalTurns: personalities.length * 2, meta: { phase: "review" } };

    const reviewText = await safeComplete(buildMessages(systemPrompt, history, ""), modelKey, p.name);
    yield { type: "stream_text" as const, personalityId: p.id, text: reviewText };
    yield { type: "turn_end" as const, personalityId: p.id };
  }

  yield { type: "phase_end" as const };
}

// ─── Mode: Reverse Brainstorm (逆向头脑风暴) ─────────────

async function* runReverseMode(
  personalities: Awaited<ReturnType<typeof getPersonalitiesByIds>>,
  userMessage: string,
  history: RoundtableMessage[],
  modelKey: string,
) {
  // Phase 1: List failure paths
  yield { type: "phase_start" as const, phase: "failures", phaseName: "集思广「败」", description: "列出所有失败路径" };

  const failures: Array<{ name: string; content: string }> = [];

  for (let i = 0; i < personalities.length; i++) {
    const p = personalities[i];

    const systemPrompt = `${p.systemPrompt}

## 场景
话题：${userMessage}

## 逆向头脑风暴
不问"怎么做好"，而是问"怎么确保彻底失败"。
用你的思维框架，列出尽可能多的失败路径和致命错误。
要有创意，要出人意料。150-200 字。`;

    yield { type: "turn_start" as const, personalityId: p.id, personalityName: p.name, turnIndex: i, totalTurns: personalities.length + 1 };

    const failText = await safeComplete(buildMessages(systemPrompt, history, userMessage), modelKey, p.name);
    yield { type: "stream_text" as const, personalityId: p.id, text: failText };
    yield { type: "turn_end" as const, personalityId: p.id };
    failures.push({ name: p.name, content: failText });
  }

  // Phase 2: Inversion — what to avoid
  yield { type: "phase_start" as const, phase: "inversion", phaseName: "反转行动", description: "从失败路径反推出避坑指南" };

  const allFailures = failures.map((f) => `【${f.name}】${f.content}`).join("\n\n");

  for (let i = 0; i < personalities.length; i++) {
    const p = personalities[i];

    const systemPrompt = `${p.systemPrompt}

## 场景
话题：${userMessage}

## 所有人列出的失败路径：
${allFailures}

## 反转
看到了所有失败路径。现在请从你的思维框架出发：
1. 这些失败路径中，哪个最致命、最容易被忽视？
2. 如果只能做三件事来避免失败，你会选哪三件？
3. 用一句话总结你的「反失败」原则。
150-200 字。`;

    yield { type: "turn_start" as const, personalityId: p.id, personalityName: p.name, turnIndex: personalities.length + i, totalTurns: personalities.length + 1, meta: { phase: "inversion" } };

    const invText = await safeComplete(buildMessages(systemPrompt, history, ""), modelKey, p.name);
    yield { type: "stream_text" as const, personalityId: p.id, text: invText };
    yield { type: "turn_end" as const, personalityId: p.id };
  }

  yield { type: "phase_end" as const };
}

// ─── Shared Utilities ─────────────────────────────────────

function buildMessages(
  systemPrompt: string,
  history: RoundtableMessage[],
  userMessage: string
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];
  for (const msg of trimmedHistory) {
    messages.push({ role: msg.role as "user" | "assistant", content: msg.content });
  }
  if (userMessage) {
    messages.push({ role: "user", content: userMessage });
  }
  return messages;
}

async function safeComplete(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  modelKey: string,
  speakerName: string
): Promise<string> {
  try {
    return await getFullResponse(messages, modelKey);
  } catch {
    return `⚠️ ${speakerName}发言失败，请重试。`;
  }
}

type ChainEvent =
  | { type: "turn_start"; personalityId: string; personalityName: string; turnIndex: number; totalTurns: number; meta?: Record<string, string> }
  | { type: "turn_end"; personalityId: string }
  | { type: "stream_text"; personalityId: string; text: string }
  | { type: "round_start"; round: number; roundName: string; roundDesc: string }
  | { type: "round_end"; round: number; roundName: string }
  | { type: "phase_start"; phase: string; phaseName: string; description: string }
  | { type: "phase_end" };

// ─── Main Handler ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: RoundtableRequest = await req.json();
    const { personalityIds, message, history = [], model, mode = "chain", hotSeatId } = body;

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

    // Select mode runner
    let modeRunner: AsyncGenerator<ChainEvent>;

    switch (mode) {
      case "debate":
        modeRunner = runDebateMode(personalities, message, history, selectedModel);
        break;
      case "hotseat":
        modeRunner = runHotSeatMode(personalities, message, history, selectedModel, hotSeatId || personalities[0].id);
        break;
      case "consult":
        modeRunner = runConsultMode(personalities, message, history, selectedModel);
        break;
      case "reverse":
        modeRunner = runReverseMode(personalities, message, history, selectedModel);
        break;
      case "chain":
      default:
        modeRunner = runChainMode(personalities, message, history, selectedModel);
        break;
    }

    const ndjsonStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of modeRunner) {
            // Send stream_text as individual chunks for typing effect
            if (event.type === "stream_text") {
              const text = event.text;
              const chunkSize = Math.max(2, Math.floor(text.length / 50));
              for (let c = 0; c < text.length; c += chunkSize) {
                const chunk = text.slice(c, c + chunkSize);
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({ personalityId: event.personalityId, content: chunk }) + "\n"
                  )
                );
                await new Promise((r) => setTimeout(r, 12));
              }
            } else {
              // Send meta events as-is
              controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
            }
          }
          controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Stream interrupted";
          console.error("[Roundtable API Error]", errorMessage);
          controller.enqueue(encoder.encode(JSON.stringify({ type: "error", error: errorMessage }) + "\n"));
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

import { NextRequest } from "next/server";
import { getPersonalitiesByIds } from "@/lib/personalities";
import { createCompletion, DEFAULT_MODEL } from "@/lib/nvidia";

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
  hotSeatId?: string;
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
  topic: string,
  history: RoundtableMessage[],
  modelKey: string,
) {
  const speakerResponses: Array<{ name: string; content: string }> = [];

  for (let i = 0; i < personalities.length; i++) {
    const p = personalities[i];
    const isFirst = i === 0;

    // 场景设定，而非指令
    const scenario = isFirst
      ? `你们几个人围坐在一张桌前，桌上没有议程、没有主持人。
桌上贴着一张纸条，写着：${topic}

你是第一个开口的。话一旦出口，其他人都会听到并接上。
就按你最自然的反应说——你会怎么起这个话头？`
      : `现在桌上贴着一张纸条：${topic}

前面这几个人已经聊起来了：

${speakerResponses.map(s => `${s.name}：「${s.content}」`).join("\n\n")}

你一直在听。现在轮到你开口了。
哪句话让你想接话？哪句话让你想反驳？还是你觉得他们都没说到点子上？
说你想说的，用你自己的方式。`;

    const systemPrompt = `${p.systemPrompt}

${scenario}

你的表达方式应该是自然的、有个人风格的。不要列举要点、不要总结陈词。
你就是你，用"我"说话。`;

    const messages = buildMessages(systemPrompt, history, isFirst ? topic : "");

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
  topic: string,
  history: RoundtableMessage[],
  modelKey: string,
) {
  const mid = Math.ceil(personalities.length / 2);
  const proTeam = personalities.slice(0, mid);
  const conTeam = personalities.slice(mid);
  const proNames = proTeam.map(p => p.name).join("、");
  const conNames = conTeam.map(p => p.name).join("、");

  const allContext: Array<{ name: string; team: "pro" | "con"; content: string }> = [];

  // Round 1: Opening statements
  yield { type: "round_start" as const, round: 0, roundName: "立论", roundDesc: "双方各自亮出核心立场" };

  for (const p of proTeam) {
    const systemPrompt = `${p.systemPrompt}

一场辩论开始了。辩题：${topic}

你的队友：${proNames}
对面：${conNames}

你站在正方这边——你天然倾向于支持这个命题。但这不是角色扮演，如果你内心其实并不认同，你可以诚实地表达你的保留。
先说你的核心论点。就像真实辩论中一样——你有自己的想法，按你的方式表达。`;

    yield { type: "turn_start" as const, personalityId: p.id, personalityName: p.name, turnIndex: allContext.length, totalTurns: personalities.length * 3, meta: { team: "pro", round: "立论" } };
    const text = await safeComplete(buildMessages(systemPrompt, history, topic), modelKey, p.name);
    yield { type: "stream_text" as const, personalityId: p.id, text };
    yield { type: "turn_end" as const, personalityId: p.id };
    allContext.push({ name: p.name, team: "pro", content: text });
  }

  for (const p of conTeam) {
    const proStatements = allContext.filter(c => c.team === "pro").map(c => `${c.name}：「${c.content}」`).join("\n\n");

    const systemPrompt = `${p.systemPrompt}

一场辩论开始了。辩题：${topic}

你的队友：${conNames}
对面：${proNames}

你站在反方这边——你天然倾向于质疑这个命题。但这不是角色扮演，如果你内心其实认同正方的某些观点，你可以坦诚地说出来。
对面已经说了：

${proStatements}

你听到了他们的论点。现在轮到你。你想怎么反驳？还是你想先承认某些合理的地方？`;

    yield { type: "turn_start" as const, personalityId: p.id, personalityName: p.name, turnIndex: allContext.length, totalTurns: personalities.length * 3, meta: { team: "con", round: "立论" } };
    const text = await safeComplete(buildMessages(systemPrompt, history, ""), modelKey, p.name);
    yield { type: "stream_text" as const, personalityId: p.id, text };
    yield { type: "turn_end" as const, personalityId: p.id };
    allContext.push({ name: p.name, team: "con", content: text });
  }

  yield { type: "round_end" as const, round: 0, roundName: "立论" };

  // Round 2: Rebuttals
  yield { type: "round_start" as const, round: 1, roundName: "驳论", roundDesc: "互相反驳对方论点" };

  for (const p of proTeam) {
    const oppStatements = allContext.filter(c => c.team === "con").map(c => `${c.name}：「${c.content}」`).join("\n\n");
    const teamStatements = allContext.filter(c => c.team === "pro" && c.name !== p.name).map(c => `${c.name}：「${c.content}」`).join("\n\n");

    const systemPrompt = `${p.systemPrompt}

辩论继续。辩题：${topic}

反方刚才的反驳：

${oppStatements}
${teamStatements ? `\n你队友说过：\n${teamStatements}\n` : ""}

你听到了对面怎么反驳你们。他们哪里说得有道理？哪里完全没抓住重点？你想怎么回应？`;

    yield { type: "turn_start" as const, personalityId: p.id, personalityName: p.name, turnIndex: allContext.length, totalTurns: personalities.length * 3, meta: { team: "pro", round: "驳论" } };
    const text = await safeComplete(buildMessages(systemPrompt, history, ""), modelKey, p.name);
    yield { type: "stream_text" as const, personalityId: p.id, text };
    yield { type: "turn_end" as const, personalityId: p.id };
    allContext.push({ name: p.name, team: "pro", content: text });
  }

  for (const p of conTeam) {
    const oppStatements = allContext.filter(c => c.team === "pro").map(c => `${c.name}：「${c.content}」`).join("\n\n");
    const teamStatements = allContext.filter(c => c.team === "con" && c.name !== p.name).map(c => `${c.name}：「${c.content}」`).join("\n\n");

    const systemPrompt = `${p.systemPrompt}

辩论继续。辩题：${topic}

正方刚才的反驳：

${oppStatements}
${teamStatements ? `\n你队友说过：\n${teamStatements}\n` : ""}

对面反驳了你们。你怎么看他们的回应？哪里站得住脚？哪里是胡扯？`;

    yield { type: "turn_start" as const, personalityId: p.id, personalityName: p.name, turnIndex: allContext.length, totalTurns: personalities.length * 3, meta: { team: "con", round: "驳论" } };
    const text = await safeComplete(buildMessages(systemPrompt, history, ""), modelKey, p.name);
    yield { type: "stream_text" as const, personalityId: p.id, text };
    yield { type: "turn_end" as const, personalityId: p.id };
    allContext.push({ name: p.name, team: "con", content: text });
  }

  yield { type: "round_end" as const, round: 1, roundName: "驳论" };

  // Round 3: Closing
  yield { type: "round_start" as const, round: 2, roundName: "结辩", roundDesc: "最终立场" };

  for (const p of [...proTeam, ...conTeam]) {
    const team = proTeam.includes(p) ? "pro" : "con";
    const fullTranscript = allContext.map(c => `${c.name}（${c.team === "pro" ? "正方" : "反方"}）：「${c.content}」`).join("\n\n");

    const systemPrompt = `${p.systemPrompt}

辩论到了最后。辩题：${topic}

整场辩论的完整记录：

${fullTranscript}

你是${team === "pro" ? "正方" : "反方"}。

最后这个机会，你想说什么？也许你被对面说服了某些点，也许你找到了新的角度。
不说套话，说你自己真实的最后想法。`;

    yield { type: "turn_start" as const, personalityId: p.id, personalityName: p.name, turnIndex: allContext.length, totalTurns: personalities.length * 3, meta: { team, round: "结辩" } };
    const text = await safeComplete(buildMessages(systemPrompt, history, ""), modelKey, p.name);
    yield { type: "stream_text" as const, personalityId: p.id, text };
    yield { type: "turn_end" as const, personalityId: p.id };
    allContext.push({ name: p.name, team, content: text });
  }

  yield { type: "round_end" as const, round: 2, roundName: "结辩" };
}

// ─── Mode: Hot Seat (热座挑战) ────────────────────────────

async function* runHotSeatMode(
  personalities: Awaited<ReturnType<typeof getPersonalitiesByIds>>,
  topic: string,
  history: RoundtableMessage[],
  modelKey: string,
  hotSeatId: string,
) {
  const hotSeat = personalities.find(p => p.id === hotSeatId) || personalities[0];
  const challengers = personalities.filter(p => p.id !== hotSeatId);

  // Phase 1: Hot seat speaks first
  yield { type: "phase_start" as const, phase: "opening", phaseName: "热座陈述", description: `${hotSeat.name} 先聊聊他的看法` };

  const openPrompt = `${hotSeat.systemPrompt}

你坐在一把椅子上，话题贴在墙上：${topic}

${challengers.map(c => c.name).join("、")} 几个人站在你面前，准备随时向你发难。
但先别管他们。就这个话题，你先说说你真实的想法。你最想表达的论点是什么？
你很清楚他们可能从各种角度来挑战你，所以把你想说的先说清楚。`;

  yield { type: "turn_start" as const, personalityId: hotSeat.id, personalityName: hotSeat.name, turnIndex: 0, totalTurns: challengers.length + 2, meta: { phase: "opening" } };
  const openingText = await safeComplete(buildMessages(openPrompt, history, topic), modelKey, hotSeat.name);
  yield { type: "stream_text" as const, personalityId: hotSeat.id, text: openingText };
  yield { type: "turn_end" as const, personalityId: hotSeat.id };

  // Phase 2: Challenges
  yield { type: "phase_start" as const, phase: "challenge", phaseName: "轮番挑战", description: "每个人向热座人物发问" };

  const challenges: Array<{ name: string; content: string }> = [];

  for (let i = 0; i < challengers.length; i++) {
    const challenger = challengers[i];
    const prevChallenges = challenges.map(c => `${c.name}：「${c.content}」`).join("\n\n");

    const challengePrompt = `${challenger.systemPrompt}

${hotSeat.name} 刚才说了这些：

「${openingText}」

话题：${topic}
${prevChallenges ? `\n你前面的这些人已经发起了挑战：\n${prevChallenges}\n` : ""}
你一直在听。${hotSeat.name}说的这些话，你觉得哪里站不住脚？哪里值得追问？
用你最擅长的方式去挑战。不是为了赢，是为了把这个话题挖得更深。`;

    yield { type: "turn_start" as const, personalityId: challenger.id, personalityName: challenger.name, turnIndex: i + 1, totalTurns: challengers.length + 2, meta: { phase: "challenge" } };
    const challengeText = await safeComplete(buildMessages(challengePrompt, history, ""), modelKey, challenger.name);
    yield { type: "stream_text" as const, personalityId: challenger.id, text: challengeText };
    yield { type: "turn_end" as const, personalityId: challenger.id };
    challenges.push({ name: challenger.name, content: challengeText });
  }

  // Phase 3: Hot seat responds
  yield { type: "phase_start" as const, phase: "response", phaseName: "热座回应", description: `${hotSeat.name} 最后的回应` };

  const allChallenges = challenges.map(c => `${c.name}：「${c.content}」`).join("\n\n");

  const responsePrompt = `${hotSeat.systemPrompt}

你之前说过：

「${openingText}」

然后这几个人向你发起了挑战：

${allChallenges}

你现在听到了所有质疑。哪些挑战让你重新思考了？哪些你觉得完全误解了你的意思？
如果你愿意修正自己的观点，就修正。如果你想反驳，就反驳。说真实想法。`;

  yield { type: "turn_start" as const, personalityId: hotSeat.id, personalityName: hotSeat.name, turnIndex: challengers.length + 1, totalTurns: challengers.length + 2, meta: { phase: "response" } };
  const responseText = await safeComplete(buildMessages(responsePrompt, history, ""), modelKey, hotSeat.name);
  yield { type: "stream_text" as const, personalityId: hotSeat.id, text: responseText };
  yield { type: "turn_end" as const, personalityId: hotSeat.id };
  yield { type: "phase_end" as const };
}

// ─── Mode: Mentor Consult (导师会诊) ─────────────────────

async function* runConsultMode(
  personalities: Awaited<ReturnType<typeof getPersonalitiesByIds>>,
  topic: string,
  history: RoundtableMessage[],
  modelKey: string,
) {
  const allNames = personalities.map(p => p.name).join("、");

  // Phase 1: Each mentor independently thinks about the problem
  yield { type: "phase_start" as const, phase: "diagnosis", phaseName: "独立思考", description: "每位导师各自消化这个问题" };

  const diagnoses: Array<{ name: string; content: string }> = [];

  for (let i = 0; i < personalities.length; i++) {
    const p = personalities[i];

    const prompt = `${p.systemPrompt}

有人带来一个问题：

「${topic}」

${allNames} 都在，每个人会从自己的角度来想这件事。
但此时此刻，其他人还没说话。你只有你自己。
按你自己的方式来思考这个问题——你最自然的第一反应是什么？`;

    yield { type: "turn_start" as const, personalityId: p.id, personalityName: p.name, turnIndex: i, totalTurns: personalities.length * 2 };
    const text = await safeComplete(buildMessages(prompt, history, topic), modelKey, p.name);
    yield { type: "stream_text" as const, personalityId: p.id, text };
    yield { type: "turn_end" as const, personalityId: p.id };
    diagnoses.push({ name: p.name, content: text });
  }

  // Phase 2: Cross-review — now everyone sees what others said
  yield { type: "phase_start" as const, phase: "review", phaseName: "互相碰撞", description: "看完大家的想法后再说" };

  const allDiagnoses = diagnoses.map(d => `${d.name}：「${d.content}」`).join("\n\n");

  for (let i = 0; i < personalities.length; i++) {
    const p = personalities[i];

    const prompt = `${p.systemPrompt}

还是那个问题：

「${topic}」

刚才每个人都独立说了一遍自己的看法。完整记录：

${allDiagnoses}

你自己的看法也在里面。现在你看完了所有人的想法。
也许有人说了让你眼前一亮的话，也许有人说的你觉得完全扯淡。
你想补充什么？修正什么？还是你觉得该反驳谁？`;

    yield { type: "turn_start" as const, personalityId: p.id, personalityName: p.name, turnIndex: personalities.length + i, totalTurns: personalities.length * 2, meta: { phase: "review" } };
    const text = await safeComplete(buildMessages(prompt, history, ""), modelKey, p.name);
    yield { type: "stream_text" as const, personalityId: p.id, text };
    yield { type: "turn_end" as const, personalityId: p.id };
  }

  yield { type: "phase_end" as const };
}

// ─── Mode: Reverse Brainstorm (逆向头脑风暴) ─────────────

async function* runReverseMode(
  personalities: Awaited<ReturnType<typeof getPersonalitiesByIds>>,
  topic: string,
  history: RoundtableMessage[],
  modelKey: string,
) {
  // Phase 1: Everyone lists failure paths
  yield { type: "phase_start" as const, phase: "failures", phaseName: "集思广「败」", description: "不谈怎么成功，只谈怎么搞砸" };

  const failures: Array<{ name: string; content: string }> = [];

  for (let i = 0; i < personalities.length; i++) {
    const p = personalities[i];

    const prompt = `${p.systemPrompt}

话题：${topic}

但今天的问题不是"怎么做好"。
问题是：如果一个人铁了心要在这件事上彻底搞砸，他会怎么做？
用你最毒的眼光，从你的经验出发，列出你能想到的最致命的错误和陷阱。`;

    yield { type: "turn_start" as const, personalityId: p.id, personalityName: p.name, turnIndex: i, totalTurns: personalities.length + 1 };
    const text = await safeComplete(buildMessages(prompt, history, topic), modelKey, p.name);
    yield { type: "stream_text" as const, personalityId: p.id, text };
    yield { type: "turn_end" as const, personalityId: p.id };
    failures.push({ name: p.name, content: text });
  }

  // Phase 2: Inversion
  yield { type: "phase_start" as const, phase: "inversion", phaseName: "反转思考", description: "从失败路径反推出该做什么" };

  const allFailures = failures.map(f => `${f.name}：「${f.content}」`).join("\n\n");

  for (let i = 0; i < personalities.length; i++) {
    const p = personalities[i];

    const prompt = `${p.systemPrompt}

话题：${topic}

刚才你们一起把这件事能搞砸的所有方式都想了一遍：

${allFailures}

现在反过来——看到了这么多坑。
从你的角度，哪个坑最容易被忽视但最致命？
如果只能记住一件事来避免这些失败，那件事是什么？`;

    yield { type: "turn_start" as const, personalityId: p.id, personalityName: p.name, turnIndex: personalities.length + i, totalTurns: personalities.length + 1, meta: { phase: "inversion" } };
    const text = await safeComplete(buildMessages(prompt, history, ""), modelKey, p.name);
    yield { type: "stream_text" as const, personalityId: p.id, text };
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
    return `⚠️ ${speakerName} 发言失败，请重试。`;
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

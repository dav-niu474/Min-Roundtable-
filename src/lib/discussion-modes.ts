// ─── Discussion Modes ─────────────────────────────────────

export type DiscussionModeId = "chain" | "debate" | "hotseat" | "consult" | "reverse";

export interface DiscussionMode {
  id: string;
  name: string;
  icon: string;
  description: string;
  longDescription: string;
  minParticipants: number;
  color: string;
  // Visual hint for the UI
  vibe: "collaborative" | "competitive" | "exploratory" | "critical" | "creative";
}

export const DISCUSSION_MODES: DiscussionMode[] = [
  {
    id: "chain",
    name: "链式碰撞",
    icon: "🔗",
    description: "依次发言，后一位能看到前面所有人的观点并回应",
    longDescription:
      "每位思想家依次发言，后面的发言者能看到并回应前面所有人的观点。最适合探索一个开放性问题，观点层层递进、逐步深化。",
    minParticipants: 2,
    color: "#6366f1",
    vibe: "collaborative",
  },
  {
    id: "debate",
    name: "辩论对抗",
    icon: "⚔️",
    description: "分正反两方，三轮交锋：立论 → 驳论 → 结辩",
    longDescription:
      "参与者分为正方和反方，围绕议题进行三轮交锋。第一轮立论陈词，第二轮互相驳斥，第三轮总结陈词。最适合争议性话题。",
    minParticipants: 4,
    color: "#ef4444",
    vibe: "competitive",
  },
  {
    id: "hotseat",
    name: "热座挑战",
    icon: "🔥",
    description: "一位思想家坐上热座，其他人轮番质疑和挑战",
    longDescription:
      "选定一位思想家坐上「热座」，先阐述自己的核心观点，然后其他人依次对其发起质疑和挑战，最后热座人物回应所有挑战。最适合深入检验某个思维框架。",
    minParticipants: 3,
    color: "#f59e0b",
    vibe: "critical",
  },
  {
    id: "consult",
    name: "导师会诊",
    icon: "💡",
    description: "你提出困境，每位导师给出独立诊断方案，最后互相点评",
    longDescription:
      "你描述一个具体的困境或决策难题，每位导师先独立给出诊断和建议方案，然后进入交叉点评环节——互相评价对方的方案，指出盲区。最适合实际决策难题。",
    minParticipants: 2,
    color: "#10b981",
    vibe: "exploratory",
  },
  {
    id: "reverse",
    name: "逆向头脑风暴",
    icon: "🕳️",
    description: "不问「如何成功」，问「如何确保失败」——芒格和塔勒布的最爱",
    longDescription:
      "逆向思维：不问「怎么做好X」，而是问「如何确保X彻底失败」。每位思想家列出尽可能多的失败路径，最后集体反转——所以我们应该避免什么？最适合风险识别和战略规划。",
    minParticipants: 2,
    color: "#8b5cf6",
    vibe: "creative",
  },
];

export function getDiscussionMode(id: string): DiscussionMode | undefined {
  return DISCUSSION_MODES.find((m) => m.id === id);
}

export function getAvailableModes(participantCount: number): DiscussionMode[] {
  return DISCUSSION_MODES.filter((m) => participantCount >= m.minParticipants);
}

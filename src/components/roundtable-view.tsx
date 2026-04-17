"use client";

import { useChatStore } from "@/store/chat-store";
import ChatMessage from "./chat-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Send, Loader2, Users, X, UserPlus, History, Trash2,
  MessageSquare, Brain, ChevronRight, Shield, Swords, Lightbulb, CircleDot,
} from "lucide-react";
import ModelSelector from "./model-selector";
import Image from "next/image";
import { useRef, useEffect, useState, useCallback } from "react";
import { personalities } from "@/lib/personalities";
import { DISCUSSION_MODES, getAvailableModes } from "@/lib/discussion-modes";
import type { DiscussionMode, DiscussionModeId } from "@/lib/discussion-modes";
import type { Message } from "@/store/chat-store";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import ConversationHistorySheet from "./conversation-sidebar";

const modeIcons: Record<string, React.ReactNode> = {
  chain: <CircleDot className="h-4 w-4" />,
  debate: <Swords className="h-4 w-4" />,
  hotseat: <Brain className="h-4 w-4" />,
  consult: <Lightbulb className="h-4 w-4" />,
  reverse: <Shield className="h-4 w-4" />,
};

export default function RoundtableView() {
  const {
    roundtableMembers,
    messages,
    isLoading,
    streamingPersonalityId,
    addMessage,
    appendToMessage,
    setLoading,
    setStreamingPersonality,
    goHome,
    startRoundtable,
    selectedModel,
    setSelectedModel,
    clearChat,
    setStreamingMessageDbId,
    discussionMode,
    hotSeatId,
    setDiscussionMode,
    setHotSeatId,
  } = useChatStore();

  const [input, setInput] = useState("");
  const [showMemberPanel, setShowMemberPanel] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [currentSpeakerName, setCurrentSpeakerName] = useState("");
  const [progressText, setProgressText] = useState("");
  const [roundLabel, setRoundLabel] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const availableModes = getAvailableModes(roundtableMembers.length);
  const currentMode = DISCUSSION_MODES.find((m) => m.id === discussionMode) || DISCUSSION_MODES[0];

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };
    addMessage(userMessage);
    setInput("");
    setLoading(true);
    setProgressText("正在启动讨论...");
    setRoundLabel(null);

    // Create placeholder messages for all members
    const placeholderIds: Record<string, string> = {};
    for (const member of roundtableMembers) {
      const id = crypto.randomUUID();
      placeholderIds[member.id] = id;
      addMessage({
        id,
        role: "assistant",
        content: "",
        personalityId: member.id,
        personalityName: member.name,
        personalityColor: member.color,
        timestamp: Date.now(),
      });
    }

    try {
      const history = messages
        .filter((m) => m.content)
        .map((m) => ({ role: m.role, content: m.content, personalityId: m.personalityId }));

      const res = await fetch("/api/roundtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personalityIds: roundtableMembers.map((m) => m.id),
          message: userMessage.content,
          history,
          model: selectedModel,
          mode: discussionMode,
          hotSeatId: hotSeatId,
        }),
      });

      if (!res.ok) throw new Error("Failed to fetch response");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed);

              if (parsed.type === "turn_start") {
                setStreamingPersonality(parsed.personalityId);
                setCurrentSpeakerName(parsed.personalityName);
                const meta = parsed.meta;
                if (meta?.round) {
                  setRoundLabel(`${meta.round} · ${parsed.personalityName}`);
                } else if (meta?.phase) {
                  setRoundLabel(parsed.personalityName);
                } else {
                  setRoundLabel(parsed.personalityName);
                }
                setProgressText(`${parsed.personalityName} 正在发言...`);
              } else if (parsed.type === "turn_end") {
                setStreamingPersonality(null);
              } else if (parsed.type === "round_start") {
                setRoundLabel(parsed.roundName);
                setProgressText(`${parsed.roundName} — ${parsed.roundDesc}`);
              } else if (parsed.type === "round_end") {
                setRoundLabel(null);
              } else if (parsed.type === "phase_start") {
                setRoundLabel(parsed.phaseName);
                setProgressText(parsed.description);
              } else if (parsed.type === "phase_end") {
                setRoundLabel(null);
              } else if (parsed.type === "done" || parsed.type === "error") {
                continue;
              } else if (parsed.personalityId && parsed.content) {
                appendToMessage(placeholderIds[parsed.personalityId], parsed.content);
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      for (const [pid, msgId] of Object.entries(placeholderIds)) {
        appendToMessage(msgId, "⚠️ 回复生成失败，请重试。");
      }
    } finally {
      setLoading(false);
      setStreamingPersonality(null);
      setStreamingMessageDbId(null);
      setProgressText("");
      setRoundLabel(null);
    }
  }, [input, isLoading, roundtableMembers, messages, addMessage, appendToMessage, setLoading, setStreamingPersonality, selectedModel, setStreamingMessageDbId, discussionMode, hotSeatId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleMember = (personalityId: string) => {
    if (isLoading) return;
    const updated = roundtableMembers.find((m) => m.id === personalityId)
      ? roundtableMembers.filter((m) => m.id !== personalityId)
      : [...roundtableMembers, personalities.find((p) => p.id === personalityId)!].filter(Boolean);
    if (updated.length >= 2) startRoundtable(updated as typeof roundtableMembers, discussionMode, hotSeatId ?? undefined);
  };

  const handleModeSelect = (modeId: DiscussionModeId) => {
    if (isLoading) return;
    setDiscussionMode(modeId);
    if (modeId === "hotseat" && !hotSeatId) {
      setHotSeatId(roundtableMembers[0]?.id || null);
    }
  };

  const handleStartRoundtable = () => {
    startRoundtable(roundtableMembers, discussionMode, hotSeatId ?? undefined);
  };

  const availableToAdd = personalities.filter(
    (p) => !roundtableMembers.find((m) => m.id === p.id)
  );

  // ─── Hot seat selector ───
  const isHotSeatMode = discussionMode === "hotseat";
  const hotSeatPerson = isHotSeatMode
    ? roundtableMembers.find((m) => m.id === hotSeatId)
    : null;

  return (
    <div className="flex h-screen flex-col">
      <ConversationHistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />

      {/* ── Header ── */}
      <header className="flex items-center gap-2 border-b border-border/50 bg-card/50 px-4 py-3 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => setHistoryOpen(true)} className="h-8 w-8 flex-shrink-0" title="对话历史">
          <History className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={goHome} className="h-8 w-8 flex-shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <ModelSelector value={selectedModel} onChange={setSelectedModel} disabled={isLoading} />
        <div
          className="flex items-center gap-1.5 flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: `${currentMode.color}15`, color: currentMode.color }}
        >
          {modeIcons[currentMode.id]}
          <span className="hidden sm:inline">{currentMode.name}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowMemberPanel(!showMemberPanel)}
          className="ml-auto gap-1 text-xs flex-shrink-0"
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">管理</span>
        </Button>
      </header>

      {/* ── Management Panel: Members + Mode ── */}
      <AnimatePresence>
        {showMemberPanel && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-border/30 bg-card/30"
          >
            <div className="px-4 py-3 space-y-3">
              {/* Members */}
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">参与者 ({roundtableMembers.length})</p>
                <div className="flex flex-wrap gap-2">
                  {roundtableMembers.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => isHotSeatMode ? setHotSeatId(member.id) : toggleMember(member.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                        isHotSeatMode && member.id === hotSeatId && "ring-2 ring-offset-1 ring-offset-background"
                      )}
                      style={{
                        borderColor: member.color,
                        backgroundColor: `${member.color}15`,
                        color: member.color,
                        ...(isHotSeatMode && member.id === hotSeatId ? { ringColor: member.color } : {}),
                      }}
                    >
                      <Image src={member.avatar} alt={member.name} width={18} height={18} className="h-[18px] w-[18px] rounded-full object-cover" />
                      {member.name}
                      {isHotSeatMode && member.id === hotSeatId && <span className="text-[10px]">🔥</span>}
                      {!isHotSeatMode && <X className="ml-0.5 h-3 w-3 opacity-50" />}
                    </button>
                  ))}
                  {availableToAdd.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => toggleMember(p.id)}
                      className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                    >
                      + {p.name}
                    </button>
                  ))}
                </div>
                {isHotSeatMode && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    🔥 点击选择热座人物（当前：<strong>{hotSeatPerson?.name || "未选"}</strong>）
                  </p>
                )}
              </div>

              {/* Mode Selection */}
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">讨论模式</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {availableModes.map((mode) => {
                    const isSelected = discussionMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => handleModeSelect(mode.id as DiscussionModeId)}
                        className={cn(
                          "flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-all",
                          isSelected
                            ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                            : "border-border/50 hover:border-border hover:bg-accent/30",
                          roundtableMembers.length < mode.minParticipants && "opacity-40 cursor-not-allowed"
                        )}
                        disabled={roundtableMembers.length < mode.minParticipants}
                      >
                        <span className="mt-0.5 text-base flex-shrink-0">{mode.icon}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold">{mode.name}</span>
                            {isSelected && (
                              <div className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-2">
                            {mode.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Start button */}
              {messages.length === 0 && (
                <Button onClick={handleStartRoundtable} className="w-full gap-2">
                  <ChevronRight className="h-4 w-4" />
                  确认开始{currentMode.name}
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Discussion Progress ── */}
      {isLoading && (
        <div className="border-b border-border/20 bg-gradient-to-b from-card/20 to-transparent px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs">
              {roundLabel && (
                <span
                  className="rounded-full px-2 py-0.5 font-medium"
                  style={{ backgroundColor: `${currentMode.color}15`, color: currentMode.color }}
                >
                  {roundLabel}
                </span>
              )}
              <span className="text-muted-foreground">{progressText}</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4">
            {roundtableMembers.map((member) => {
              const isActive = streamingPersonalityId === member.id;
              return (
                <motion.div
                  key={member.id}
                  className="relative flex flex-col items-center"
                  animate={isActive ? { scale: [1, 1.05, 1] } : { scale: 1 }}
                  transition={isActive ? { repeat: Infinity, duration: 2 } : {}}
                >
                  <div
                    className={cn(
                      "relative h-11 w-11 overflow-hidden rounded-full border-2 transition-all sm:h-12 sm:w-12",
                      isActive && "ring-2 ring-offset-2 ring-offset-background",
                      !isActive && "opacity-50"
                    )}
                    style={{ borderColor: member.color }}
                  >
                    <Image src={member.avatar} alt={member.name} fill className="object-cover" sizes="48px" />
                    {isActive && <div className="absolute inset-0 animate-pulse bg-white/20 rounded-full" />}
                  </div>
                  <span className="mt-1 text-[10px] font-medium" style={{ color: isActive ? member.color : undefined }}>
                    {member.name}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8">
        <div className="mx-auto max-w-4xl py-6">
          {messages.length === 0 && !showMemberPanel && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex -space-x-3">
                {roundtableMembers.map((member) => (
                  <div key={member.id} className="h-14 w-14 overflow-hidden rounded-full border-2 border-background">
                    <Image src={member.avatar} alt={member.name} width={56} height={56} className="object-cover" />
                  </div>
                ))}
              </div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-2xl">{currentMode.icon}</span>
                <h2 className="text-lg font-bold">{currentMode.name}</h2>
              </div>
              <p className="mb-1 max-w-lg text-sm text-muted-foreground">{currentMode.longDescription}</p>
              {isHotSeatMode && hotSeatPerson && (
                <p className="mt-2 text-xs text-muted-foreground">
                  🔥 热座人物：<strong style={{ color: hotSeatPerson.color }}>{hotSeatPerson.name}</strong>
                </p>
              )}
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {["AI会取代人类吗？", "什么是好的决策？", "如何找到人生方向？", "创业最重要的是什么？"].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent/50 hover:text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowMemberPanel(true)}
                className="mt-6 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
              >
                管理参与者和讨论模式 →
              </button>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              avatar={
                msg.role === "assistant" && msg.personalityId
                  ? roundtableMembers.find((m) => m.id === msg.personalityId)?.avatar
                  : undefined
              }
              personalityName={msg.personalityName}
              personalityColor={msg.personalityColor}
            />
          ))}

          {isLoading && messages[messages.length - 1]?.content === "" && (
            <div className="flex gap-3 py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>正在启动讨论...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Input ── */}
      <div className="border-t border-border/50 bg-card/50 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="抛出一个话题..."
            className="min-h-[44px] max-h-[200px] resize-none rounded-xl border-border/50 bg-background text-sm"
            rows={1}
            disabled={isLoading}
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-11 w-11 flex-shrink-0 rounded-xl"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

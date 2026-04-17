"use client";

import { useChatStore } from "@/store/chat-store";
import ChatMessage from "./chat-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Send, Loader2, Users, X, UserPlus, History,
  MessageSquare, ChevronRight, Reply, CircleStop,
} from "lucide-react";
import ModelSelector from "./model-selector";
import Image from "next/image";
import { useRef, useEffect, useState, useCallback } from "react";
import { personalities } from "@/lib/personalities";
import type { Message } from "@/store/chat-store";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import ConversationHistorySheet from "./conversation-sidebar";

export default function RoundtableView() {
  const {
    roundtableMembers,
    messages,
    isLoading,
    streamingPersonalityId,
    addMessage,
    setLoading,
    setStreamingPersonality,
    goHome,
    startRoundtable,
    selectedModel,
    setSelectedModel,
    setStreamingMessageDbId,
  } = useChatStore();

  const [input, setInput] = useState("");
  const [showMemberPanel, setShowMemberPanel] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const streamingPerson = streamingPersonalityId
    ? roundtableMembers.find(m => m.id === streamingPersonalityId)
    : null;

  // ─── 核心方法：让某个成员发言 ───
  const speakAs = useCallback(async (personalityId: string, triggerMessage?: string) => {
    if (isLoading) return;

    const member = roundtableMembers.find(m => m.id === personalityId);
    if (!member) return;

    setLoading(true);
    setStreamingPersonality(personalityId);

    // 创建占位消息
    const msgId = crypto.randomUUID();
    addMessage({
      id: msgId,
      role: "assistant",
      content: "",
      personalityId: member.id,
      personalityName: member.name,
      personalityColor: member.color,
      timestamp: Date.now(),
    });

    try {
      // 构建完整对话历史（当前store里的所有消息）
      const currentMessages = useChatStore.getState().messages;
      const history = currentMessages
        .filter(m => m.content)
        .map(m => ({
          role: m.role,
          content: m.content,
          personalityId: m.personalityId,
          personalityName: m.personalityName,
        }));

      // triggerMessage 是触发这次发言的那条消息（用户刚发的，或者某条被回复的消息）
      const message = triggerMessage || (currentMessages.length > 0 ? currentMessages[currentMessages.length - 1].content : "");

      const res = await fetch("/api/roundtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personalityId: member.id,
          personalityIds: roundtableMembers.map(m => m.id),
          message,
          history,
          model: selectedModel,
        }),
      });

      if (!res.ok) throw new Error("Failed to fetch");

      // 处理SSE流式响应
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
            if (!trimmed || !trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              if (parsed.content) {
                useChatStore.getState().appendToMessage(msgId, parsed.content);
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      useChatStore.getState().appendToMessage(msgId, "⚠️ 发言失败，请重试。");
    } finally {
      setLoading(false);
      setStreamingPersonality(null);
      setStreamingMessageDbId(null);
    }
  }, [isLoading, roundtableMembers, selectedModel, addMessage, setLoading, setStreamingPersonality, setStreamingMessageDbId]);

  // ─── 用户发消息：所有成员依次回应 ───
  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };
    addMessage(userMsg);
    const triggerText = input.trim();
    setInput("");

    // 依次让每个成员回应
    for (const member of roundtableMembers) {
      // 每次发言前重新读取最新消息历史
      await speakAs(member.id, triggerText);
    }
  }, [input, isLoading, roundtableMembers, speakAs, addMessage]);

  // ─── 点击让某人回应 ───
  const handleReplyTo = async (personalityId: string, replyContent?: string) => {
    if (isLoading) return;
    await speakAs(personalityId, replyContent);
  };

  // ─── 下一个人发言（轮转） ───
  const speakNext = useCallback(async () => {
    if (isLoading || roundtableMembers.length === 0) return;

    const currentMessages = useChatStore.getState().messages;
    let lastSpeakerIndex = -1;

    for (let i = currentMessages.length - 1; i >= 0; i--) {
      const msg = currentMessages[i];
      if (msg.role === "assistant" && msg.personalityId) {
        const idx = roundtableMembers.findIndex(m => m.id === msg.personalityId);
        if (idx !== -1) {
          lastSpeakerIndex = idx;
          break;
        }
      }
    }

    const nextIndex = (lastSpeakerIndex + 1) % roundtableMembers.length;
    await speakAs(roundtableMembers[nextIndex].id);
  }, [isLoading, roundtableMembers, speakAs]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleMember = (personalityId: string) => {
    if (isLoading) return;
    const updated = roundtableMembers.find(m => m.id === personalityId)
      ? roundtableMembers.filter(m => m.id !== personalityId)
      : [...roundtableMembers, personalities.find(p => p.id === personalityId)!].filter(Boolean);
    if (updated.length >= 2) startRoundtable(updated);
  };

  const availableToAdd = personalities.filter(
    p => !roundtableMembers.find(m => m.id === p.id)
  );

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

        {/* 成员头像 */}
        <div className="flex items-center -space-x-2 ml-2">
          {roundtableMembers.map(member => (
            <div
              key={member.id}
              className={cn(
                "relative h-7 w-7 rounded-full border-2 border-background transition-all",
                streamingPersonalityId === member.id && "ring-2 ring-offset-1 ring-offset-background z-10"
              )}
              style={{ borderColor: streamingPersonalityId === member.id ? member.color : undefined }}
              title={member.name}
            >
              <Image src={member.avatar} alt={member.name} width={28} height={28} className="rounded-full object-cover" />
              {streamingPersonalityId === member.id && (
                <div className="absolute inset-0 animate-pulse rounded-full bg-white/30" />
              )}
            </div>
          ))}
        </div>
        <span className="ml-1 text-xs text-muted-foreground hidden sm:inline">
          {roundtableMembers.length}人圆桌
        </span>

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

      {/* ── 管理面板 ── */}
      <AnimatePresence>
        {showMemberPanel && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-border/30 bg-card/30"
          >
            <div className="px-4 py-3 space-y-3">
              <div>
                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  圆桌成员 ({roundtableMembers.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {roundtableMembers.map(member => (
                    <button
                      key={member.id}
                      onClick={() => toggleMember(member.id)}
                      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all"
                      style={{
                        borderColor: member.color,
                        backgroundColor: `${member.color}15`,
                        color: member.color,
                      }}
                    >
                      <Image src={member.avatar} alt={member.name} width={18} height={18} className="h-[18px] w-[18px] rounded-full object-cover" />
                      {member.name}
                      <X className="ml-0.5 h-3 w-3 opacity-50" />
                    </button>
                  ))}
                  {availableToAdd.map(p => (
                    <button
                      key={p.id}
                      onClick={() => toggleMember(p.id)}
                      className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                    >
                      + {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {messages.length === 0 && (
                <Button onClick={() => setShowMemberPanel(false)} className="w-full gap-2">
                  <ChevronRight className="h-4 w-4" />
                  开始讨论
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 正在发言提示 ── */}
      {isLoading && streamingPerson && (
        <div className="border-b border-border/20 bg-gradient-to-b from-card/20 to-transparent px-4 py-2">
          <div className="flex items-center gap-2 text-xs">
            <Image src={streamingPerson.avatar} alt={streamingPerson.name} width={20} height={20} className="h-5 w-5 rounded-full" />
            <span className="font-medium" style={{ color: streamingPerson.color }}>
              {streamingPerson.name}
            </span>
            <span className="text-muted-foreground">正在思考...</span>
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />
          </div>
        </div>
      )}

      {/* ── 消息列表 ── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8">
        <div className="mx-auto max-w-4xl py-6">
          {messages.length === 0 && !showMemberPanel && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex -space-x-3">
                {roundtableMembers.map(member => (
                  <div key={member.id} className="h-14 w-14 overflow-hidden rounded-full border-2 border-background">
                    <Image src={member.avatar} alt={member.name} width={56} height={56} className="object-cover" />
                  </div>
                ))}
              </div>
              <div className="mb-2 flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-bold">思想圆桌</h2>
              </div>
              <p className="mb-4 max-w-md text-sm text-muted-foreground leading-relaxed">
                每个人都是独立的思想者。抛出一个话题，他们会根据自己的思维框架自由讨论、互相碰撞。
                你可以随时参与，也可以点名让某人回应。
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {["AI会取代人类吗？", "什么是好的决策？", "如何找到人生方向？", "创业最重要的是什么？"].map(q => (
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
                管理圆桌成员 →
              </button>
            </div>
          )}

          {messages.map(msg => {
            const isUser = msg.role === "user";
            const member = !isUser && msg.personalityId
              ? roundtableMembers.find(m => m.id === msg.personalityId)
              : null;

            return (
              <div key={msg.id} className="group relative mb-4">
                <ChatMessage
                  message={msg}
                  avatar={member?.avatar}
                  personalityName={msg.personalityName}
                  personalityColor={msg.personalityColor}
                />

                {/* 悬停时显示"让TA再说"按钮 */}
                {!isUser && msg.personalityId && msg.content && !isLoading && (
                  <div className="absolute -right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full border border-border/50 bg-background shadow-sm"
                      onClick={() => handleReplyTo(msg.personalityId!, msg.content)}
                      title={`让${msg.personalityName}再说`}
                    >
                      <Reply className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── 输入区 ── */}
      <div className="border-t border-border/50 bg-card/50 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl">
          {/* 快捷：让某人发言 */}
          {messages.length > 0 && !isLoading && (
            <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1">
              <span className="text-[11px] text-muted-foreground flex-shrink-0 mr-1">点名：</span>
              {roundtableMembers.map(member => (
                <button
                  key={member.id}
                  onClick={() => handleReplyTo(member.id)}
                  className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-all hover:scale-105 flex-shrink-0"
                  style={{
                    borderColor: `${member.color}40`,
                    backgroundColor: `${member.color}10`,
                    color: member.color,
                  }}
                >
                  <Image src={member.avatar} alt={member.name} width={14} height={14} className="h-3.5 w-3.5 rounded-full" />
                  {member.name}
                </button>
              ))}
              <button
                onClick={speakNext}
                className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                title="下一位"
              >
                <MessageSquare className="h-3 w-3" />
                下一位
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="抛出一个话题，或回应讨论..."
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
              {isLoading ? <CircleStop className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

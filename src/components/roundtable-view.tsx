"use client";

import { useChatStore } from "@/store/chat-store";
import ChatMessage from "./chat-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Loader2, Users, X, UserPlus, History, Trash2 } from "lucide-react";
import ModelSelector from "./model-selector";
import Image from "next/image";
import { useRef, useEffect, useState, useCallback } from "react";
import { personalities } from "@/lib/personalities";
import type { Message } from "@/store/chat-store";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import ConversationSidebar from "./conversation-sidebar";

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
  } = useChatStore();
  const [input, setInput] = useState("");
  const [showMemberPanel, setShowMemberPanel] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

    const placeholderIds: Record<string, string> = {};
    for (const member of roundtableMembers) {
      const id = crypto.randomUUID();
      placeholderIds[member.id] = id;
      const placeholder: Message = {
        id,
        role: "assistant",
        content: "",
        personalityId: member.id,
        personalityName: member.name,
        personalityColor: member.color,
        timestamp: Date.now(),
      };
      addMessage(placeholder);
    }

    try {
      const history = messages
        .filter((m) => m.content)
        .map((m) => ({
          role: m.role,
          content: m.content,
          personalityId: m.personalityId,
        }));

      const res = await fetch("/api/roundtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personalityIds: roundtableMembers.map((m) => m.id),
          message: userMessage.content,
          history,
          model: selectedModel,
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
            if (!trimmed || trimmed === "data: [DONE]") continue;

            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.type === "done") continue;
              if (parsed.personalityId && parsed.content) {
                const msgId = placeholderIds[parsed.personalityId];
                if (msgId) {
                  setStreamingPersonality(parsed.personalityId);
                  appendToMessage(msgId, parsed.content);
                }
              }
            } catch {
              // skip malformed lines
            }
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
    }
  }, [
    input,
    isLoading,
    roundtableMembers,
    messages,
    addMessage,
    appendToMessage,
    setLoading,
    setStreamingPersonality,
    selectedModel,
    setStreamingMessageDbId,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleMember = (personalityId: string) => {
    if (isLoading) return;
    if (roundtableMembers.find((m) => m.id === personalityId)) {
      const updated = roundtableMembers.filter((m) => m.id !== personalityId);
      if (updated.length >= 2) {
        startRoundtable(updated);
      }
    } else {
      const personality = personalities.find((p) => p.id === personalityId);
      if (personality) {
        startRoundtable([...roundtableMembers, personality]);
      }
    }
  };

  const availableToAdd = personalities.filter(
    (p) => !roundtableMembers.find((m) => m.id === p.id)
  );

  return (
    <div className="flex h-screen">
      {/* Conversation Sidebar */}
      <ConversationSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center gap-2 border-b border-border/50 bg-card/50 px-4 py-3 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="h-8 w-8 flex-shrink-0"
            title="对话历史"
          >
            <History className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={goHome}
            className="h-8 w-8 flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {messages.length > 0 && !isLoading && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearChat}
              className="h-8 w-8 flex-shrink-0"
              title="清空对话"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <ModelSelector
            value={selectedModel}
            onChange={setSelectedModel}
            disabled={isLoading}
          />
          <Users className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold">圆桌讨论</h2>
            <p className="truncate text-xs text-muted-foreground">
              {roundtableMembers.map((m) => m.name).join(" · ")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMemberPanel(!showMemberPanel)}
            className="ml-auto gap-1 text-xs flex-shrink-0"
          >
            <UserPlus className="h-3.5 w-3.5" />
            管理
          </Button>
        </header>

        {/* Member Panel */}
        <AnimatePresence>
          {showMemberPanel && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-border/30 bg-card/30"
            >
              <div className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  {roundtableMembers.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => toggleMember(member.id)}
                      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                      style={{
                        borderColor: member.color,
                        backgroundColor: `${member.color}15`,
                        color: member.color,
                      }}
                    >
                      <Image
                        src={member.avatar}
                        alt={member.name}
                        width={18}
                        height={18}
                        className="h-[18px] w-[18px] rounded-full object-cover"
                      />
                      {member.name}
                      <X className="ml-0.5 h-3 w-3" />
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Roundtable Seat Visualization */}
        <div className="flex items-center justify-center gap-3 border-b border-border/20 bg-gradient-to-b from-card/20 to-transparent px-4 py-4">
          {roundtableMembers.map((member, i) => {
            const isStreaming = streamingPersonalityId === member.id;
            return (
              <motion.div
                key={member.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.1 }}
                className="relative flex flex-col items-center"
              >
                <div
                  className={cn(
                    "relative h-12 w-12 overflow-hidden rounded-full border-2 transition-all sm:h-14 sm:w-14",
                    isStreaming && "ring-2 ring-offset-2 ring-offset-background"
                  )}
                  style={{
                    borderColor: member.color,
                  }}
                >
                  <Image
                    src={member.avatar}
                    alt={member.name}
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                  {isStreaming && (
                    <div className="absolute inset-0 animate-pulse bg-white/20" />
                  )}
                </div>
                <span
                  className="mt-1 text-[10px] font-medium sm:text-xs"
                  style={{ color: member.color }}
                >
                  {member.name}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8">
          <div className="mx-auto max-w-4xl py-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex -space-x-3">
                  {roundtableMembers.map((member) => (
                    <div
                      key={member.id}
                      className="h-14 w-14 overflow-hidden rounded-full border-2 border-background"
                    >
                      <Image
                        src={member.avatar}
                        alt={member.name}
                        width={56}
                        height={56}
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
                <h2 className="mb-2 text-lg font-bold">圆桌讨论已就绪</h2>
                <p className="mb-1 text-sm text-muted-foreground">
                  {roundtableMembers.map((m) => m.name).join("、")}
                </p>
                <p className="max-w-md text-xs text-muted-foreground/70">
                  提出你的问题，每位思想家会依次用各自的思维框架回答。
                  不同视角的碰撞会带来意想不到的洞察。
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                avatar={
                  msg.role === "assistant" && msg.personalityId
                    ? roundtableMembers.find((m) => m.id === msg.personalityId)
                        ?.avatar
                    : undefined
                }
                personalityName={msg.personalityName}
                personalityColor={msg.personalityColor}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-border/50 bg-card/50 px-4 py-3 backdrop-blur-sm">
          <div className="mx-auto flex max-w-4xl items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="向圆桌提出你的问题..."
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
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

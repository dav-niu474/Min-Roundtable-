"use client";

import { useChatStore } from "@/store/chat-store";
import ChatMessage from "./chat-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Loader2, BookOpen, Sparkles, History, Trash2 } from "lucide-react";
import ModelSelector from "./model-selector";
import Image from "next/image";
import { useRef, useEffect, useState, useCallback } from "react";
import type { Message } from "@/store/chat-store";
import ConversationSidebar from "./conversation-sidebar";

export default function ChatView() {
  const {
    activePersonality,
    messages,
    isLoading,
    addMessage,
    appendToMessage,
    setLoading,
    goHome,
    selectedModel,
    setSelectedModel,
    clearChat,
    setStreamingMessageDbId,
  } = useChatStore();
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !activePersonality || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };
    addMessage(userMessage);
    setInput("");
    setLoading(true);

    const assistantId = crypto.randomUUID();
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      personalityId: activePersonality.id,
      personalityName: activePersonality.name,
      personalityColor: activePersonality.color,
      timestamp: Date.now(),
    };
    addMessage(assistantMessage);

    try {
      const history = messages
        .filter((m) => m.content)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personalityId: activePersonality.id,
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
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  appendToMessage(assistantId, parsed.content);
                }
              } catch {
                appendToMessage(assistantId, data);
              }
            }
          }
        }
      }
    } catch {
      appendToMessage(
        assistantId,
        "\n\n⚠️ 抱歉，生成回复时出现了错误，请重试。"
      );
    } finally {
      setStreamingMessageDbId(null);
      setLoading(false);
    }
  }, [input, activePersonality, isLoading, messages, addMessage, appendToMessage, setLoading, selectedModel, setStreamingMessageDbId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!activePersonality) return null;

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
          <div className="relative h-9 w-9 overflow-hidden rounded-full border-2 flex-shrink-0"
            style={{ borderColor: activePersonality.color }}
          >
            <Image
              src={activePersonality.avatar}
              alt={activePersonality.name}
              fill
              className="object-cover"
              sizes="36px"
            />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold">{activePersonality.name}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {activePersonality.nameEn} · {activePersonality.title.split("·")[0].trim()}
            </p>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar - mental models */}
          <aside className="hidden w-64 flex-shrink-0 border-r border-border/30 bg-card/30 p-4 lg:block overflow-y-auto">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              心智模型
            </h3>
            <div className="space-y-2">
              {activePersonality.mentalModels.map((model) => (
                <div
                  key={model}
                  className="rounded-lg px-3 py-2 text-xs"
                  style={{
                    backgroundColor: `${activePersonality.color}10`,
                    color: activePersonality.color,
                  }}
                >
                  {model}
                </div>
              ))}
            </div>

            <h3 className="mb-3 mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              领域
            </h3>
            <p className="text-xs text-muted-foreground">
              {activePersonality.domain}
            </p>

            <h3 className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              标志性名言
            </h3>
            <blockquote className="border-l-2 px-3 py-2 text-xs italic text-muted-foreground"
              style={{ borderColor: activePersonality.color }}
            >
              &ldquo;{activePersonality.quote}&rdquo;
            </blockquote>
          </aside>

          {/* Chat Area */}
          <div className="flex flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-4 sm:px-8">
              <div className="mx-auto max-w-3xl py-6">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div
                      className="mb-4 h-20 w-20 overflow-hidden rounded-2xl border-2"
                      style={{ borderColor: activePersonality.color }}
                    >
                      <Image
                        src={activePersonality.avatar}
                        alt={activePersonality.name}
                        width={80}
                        height={80}
                        className="object-cover"
                      />
                    </div>
                    <h2 className="mb-1 text-lg font-bold">{activePersonality.name}</h2>
                    <p className="mb-4 text-sm text-muted-foreground">
                      {activePersonality.title}
                    </p>
                    <p className="max-w-md text-sm text-muted-foreground/70">
                      我以{activePersonality.name}的视角和你聊，基于公开言论提炼的思维框架，非本人观点。
                    </p>
                  </div>
                )}
                {messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    avatar={
                      msg.role === "assistant"
                        ? activePersonality.avatar
                        : undefined
                    }
                    personalityName={msg.personalityName}
                    personalityColor={msg.personalityColor}
                  />
                ))}
                {isLoading && messages[messages.length - 1]?.content === "" && (
                  <div className="flex gap-3 py-4">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className="border-t border-border/50 bg-card/50 px-4 py-3 backdrop-blur-sm">
              <div className="mx-auto flex max-w-3xl items-end gap-2">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`向${activePersonality.name}提问...`}
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
      </div>
    </div>
  );
}

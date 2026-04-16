"use client";

import { cn } from "@/lib/utils";
import type { Message } from "@/store/chat-store";
import ReactMarkdown from "react-markdown";
import { useRef, useEffect } from "react";

interface ChatMessageProps {
  message: Message;
  avatar?: string;
  personalityName?: string;
  personalityColor?: string;
}

export default function ChatMessage({
  message,
  avatar,
  personalityName,
  personalityColor,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [message.content]);

  return (
    <div
      ref={scrollRef}
      className={cn("flex gap-3 py-4", isUser ? "flex-row-reverse" : "flex-row")}
    >
      {/* Avatar */}
      {!isUser && avatar && (
        <div
          className="mt-1 h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border-2"
          style={{ borderColor: personalityColor || "var(--border)" }}
        >
          <img
            src={avatar}
            alt={personalityName || "AI"}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      {/* Content */}
      <div
        className={cn(
          "max-w-[80%] space-y-1",
          isUser ? "items-end" : "items-start"
        )}
      >
        {!isUser && personalityName && (
          <p className="text-xs font-medium" style={{ color: personalityColor }}>
            {personalityName}
          </p>
        )}
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border/50 text-foreground"
          )}
          style={
            !isUser && personalityColor
              ? { borderLeftWidth: "3px", borderLeftColor: personalityColor }
              : undefined
          }
        >
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none prose-p:my-1 prose-pre:my-2 prose-pre:rounded-lg prose-pre:bg-background prose-code:text-xs prose-headings:my-2 prose-headings:text-foreground prose-strong:text-foreground prose-em:text-muted-foreground">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      {/* User avatar placeholder */}
      {isUser && (
        <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          You
        </div>
      )}
    </div>
  );
}

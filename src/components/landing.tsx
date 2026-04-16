"use client";

import { personalities } from "@/lib/personalities";
import PersonalityCard from "./personality-card";
import { useChatStore } from "@/store/chat-store";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Sparkles, Users, BookOpen, Zap } from "lucide-react";
import { useEffect } from "react";
import type { Conversation } from "@/store/chat-store";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

function RecentConversationsSection() {
  const { conversations, loadConversation } = useChatStore();

  const recentConversations = conversations.slice(0, 5);

  if (recentConversations.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-px flex-1 bg-border/30" />
        <span className="flex-shrink-0 text-xs tracking-wide">最近对话</span>
        <div className="h-px flex-1 bg-border/30" />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {recentConversations.map((conv: Conversation) => {
          const isRoundtable = conv.type === "roundtable";
          const personality = !isRoundtable
            ? personalities.find((p) => p.id === conv.personalityIds[0])
            : null;

          return (
            <button
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className="group min-w-[200px] flex-shrink-0 rounded-xl border border-border/40 bg-card/50 p-4 text-left transition-all hover:border-border/80 hover:bg-card hover:shadow-sm sm:min-w-0"
            >
              <div className="flex items-center gap-2.5">
                {/* Avatar / Icon */}
                {isRoundtable ? (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                ) : personality ? (
                  <div
                    className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border"
                    style={{ borderColor: personality.color }}
                  >
                    <Image
                      src={personality.avatar}
                      alt={personality.name}
                      width={32}
                      height={32}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-medium">
                    {conv.title || (isRoundtable ? "圆桌讨论" : "新对话")}
                  </h4>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="truncate">
                      {isRoundtable
                        ? conv.personalityIds.length + "位思想家"
                        : personality?.name || ""}
                    </span>
                    <span className="hidden text-muted-foreground/40 sm:inline">·</span>
                    <span className="hidden flex-shrink-0 sm:inline">
                      {conv.messageCount}条消息
                    </span>
                  </div>
                </div>
              </div>

              {/* Time */}
              <p className="mt-2 text-[10px] text-muted-foreground/50">
                {(() => {
                  try {
                    return formatDistanceToNow(new Date(conv.updatedAt), {
                      addSuffix: true,
                      locale: zhCN,
                    });
                  } catch {
                    return "";
                  }
                })()}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function Landing() {
  const {
    roundtableSelected,
    startRoundtable,
    initSession,
  } = useChatStore();

  const selectedCount = roundtableSelected.size;
  const selectedPersonalities = personalities.filter((p) =>
    roundtableSelected.has(p.id)
  );

  const handleStartRoundtable = () => {
    if (selectedCount >= 2) {
      startRoundtable(selectedPersonalities);
    }
  };

  useEffect(() => {
    initSession();
  }, [initSession]);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="relative overflow-hidden border-b border-border/30">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 py-8 sm:py-16">
          <div className="flex items-center justify-between">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center flex-1"
            >
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/50 bg-card px-4 py-1.5 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Powered by 女娲思维蒸馏
              </div>
              <h1 className="mb-4 bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-6xl">
                思想圆桌
              </h1>
              <p className="mx-auto mb-8 max-w-2xl text-base text-muted-foreground sm:text-lg">
                与人类最伟大的思想家对话
                <span className="mx-2 text-border">·</span>
                Distilled Thinking Systems
              </p>
              <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  <span>8 位思想家</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4" />
                  <span>35+ 心智模型</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Zap className="h-4 w-4" />
                  <span>圆桌讨论</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </header>

      {/* Personality Grid */}
      <main className="mx-auto flex-1 max-w-6xl px-4 py-10 overflow-y-auto">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {personalities.map((personality, index) => (
            <PersonalityCard
              key={personality.id}
              personality={personality}
              index={index}
            />
          ))}
        </div>
      </main>

      {/* Recent Conversations */}
      <RecentConversationsSection />

      {/* Floating Action Buttons */}
      <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 sm:bottom-8">
        <div className="flex items-center gap-3">
          {/* Roundtable Button */}
          {selectedCount >= 2 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Button
                onClick={handleStartRoundtable}
                size="lg"
                className="shadow-2xl gap-2 rounded-full px-8 py-6 text-base font-semibold"
              >
                <Users className="h-5 w-5" />
                开始圆桌讨论
                <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-sm">
                  {selectedCount}
                </span>
              </Button>
            </motion.div>
          ) : selectedCount === 1 ? (
            <div className="rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground shadow-lg">
              再选择至少 1 位思想家开始圆桌讨论
            </div>
          ) : null}
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/30 py-4">
        <p className="text-center text-xs text-muted-foreground/60">
          Powered by 女娲思维蒸馏 · Nuwa Thinking Distillation · Based on{" "}
          <a
            href="https://github.com/alchaincyf/nuwa-skill"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:text-foreground/80 hover:underline"
          >
            nuwa-skill
          </a>
        </p>
      </footer>
    </div>
  );
}

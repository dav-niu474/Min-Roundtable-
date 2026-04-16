"use client";

import { personalities } from "@/lib/personalities";
import PersonalityCard from "./personality-card";
import { useChatStore } from "@/store/chat-store";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Sparkles, Users, BookOpen, Zap } from "lucide-react";

export default function Landing() {
  const { roundtableSelected, startRoundtable, goHome } = useChatStore();
  const selectedCount = roundtableSelected.size;
  const selectedPersonalities = personalities.filter((p) =>
    roundtableSelected.has(p.id)
  );

  const handleStartRoundtable = () => {
    if (selectedCount >= 2) {
      startRoundtable(selectedPersonalities);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <header className="relative overflow-hidden border-b border-border/30">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
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
      </header>

      {/* Personality Grid */}
      <main className="mx-auto flex-1 max-w-6xl px-4 py-10">
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

      {/* Floating Roundtable Button */}
      {selectedCount >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 sm:bottom-8"
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
      )}

      {/* Selection Indicator */}
      {selectedCount === 1 && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 sm:bottom-8">
          <div className="rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground shadow-lg">
            再选择至少 1 位思想家开始圆桌讨论
          </div>
        </div>
      )}

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

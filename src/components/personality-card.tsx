"use client";

import Image from "next/image";
import type { Personality } from "@/lib/personalities";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Users, Plus, Check } from "lucide-react";
import { motion } from "framer-motion";
import { useChatStore } from "@/store/chat-store";
import { cn } from "@/lib/utils";

interface PersonalityCardProps {
  personality: Personality;
  index: number;
}

export default function PersonalityCard({
  personality,
  index,
}: PersonalityCardProps) {
  const {
    startChat,
    toggleRoundtableSelection,
    roundtableSelected,
    mode,
  } = useChatStore();

  const isSelected = roundtableSelected.has(personality.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4, ease: "easeOut" }}
      className="group relative"
    >
      <div
        className="relative overflow-hidden rounded-2xl border border-border/50 bg-card p-5 transition-all duration-300 hover:border-border hover:shadow-lg"
        style={{
          "--glow-color": personality.color,
        } as React.CSSProperties}
      >
        {/* Glow effect */}
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background: `radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${personality.color}10, transparent 40%)`,
          }}
        />

        <div className="relative z-10">
          {/* Avatar + Name */}
          <div className="mb-4 flex items-center gap-4">
            <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border-2 border-border/30">
              <Image
                src={personality.avatar}
                alt={personality.name}
                fill
                className="object-cover"
                sizes="64px"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-bold text-foreground">
                {personality.name}
              </h3>
              <p className="truncate text-sm text-muted-foreground">
                {personality.nameEn}
              </p>
            </div>
          </div>

          {/* Title */}
          <p className="mb-2 text-sm font-medium" style={{ color: personality.color }}>
            {personality.title}
          </p>

          {/* Domain */}
          <Badge variant="secondary" className="mb-3 text-xs">
            {personality.domain}
          </Badge>

          {/* Quote */}
          <p className="mb-4 line-clamp-2 text-xs leading-relaxed text-muted-foreground italic">
            &ldquo;{personality.quote}&rdquo;
          </p>

          {/* Mental Models */}
          <div className="mb-4 flex flex-wrap gap-1">
            {personality.mentalModels.slice(0, 3).map((model) => (
              <span
                key={model}
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: `${personality.color}15`,
                  color: personality.color,
                }}
              >
                {model}
              </span>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => startChat(personality)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              单独对话
            </button>
            {mode === "landing" && (
              <button
                onClick={() => toggleRoundtableSelection(personality.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                  isSelected
                    ? "border-transparent text-white"
                    : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                )}
                style={
                  isSelected
                    ? { backgroundColor: personality.color }
                    : undefined
                }
              >
                {isSelected ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    已选
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    圆桌
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

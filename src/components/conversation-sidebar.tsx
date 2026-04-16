"use client";

import { useChatStore, type Conversation } from "@/store/chat-store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  MessageCircle,
  Users,
  Trash2,
  History,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { personalities } from "@/lib/personalities";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

interface ConversationHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ConversationHistorySheet({
  open,
  onOpenChange,
}: ConversationHistorySheetProps) {
  const {
    conversations,
    currentConversationId,
    loadConversation,
    deleteConversation,
    goHome,
  } = useChatStore();

  const formatDate = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), {
        addSuffix: true,
        locale: zhCN,
      });
    } catch {
      return "";
    }
  };

  const getPersonalityInfo = (ids: string[]) => {
    return ids
      .map((id) => personalities.find((p) => p.id === id))
      .filter(Boolean);
  };

  const handleDelete = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    await deleteConversation(convId);
  };

  const handleLoadConversation = (convId: string) => {
    loadConversation(convId);
    onOpenChange(false);
  };

  const handleGoHome = () => {
    goHome();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-full p-0 sm:max-w-[320px]"
      >
        {/* Header */}
        <SheetHeader className="border-b border-border/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <SheetTitle className="text-sm">对话历史</SheetTitle>
          </div>
          <SheetDescription className="sr-only">
            浏览和选择历史对话
          </SheetDescription>
          <div className="flex items-center gap-1 pt-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleGoHome}
              className="h-8 w-8"
              title="新对话"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Conversation List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-3 rounded-full bg-muted p-3">
                  <MessageCircle className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">暂无对话记录</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  选择思想家开始对话
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {conversations.map((conv: Conversation) => {
                  const isActive = conv.id === currentConversationId;
                  const infos = getPersonalityInfo(conv.personalityIds);
                  const isRoundtable = conv.type === "roundtable";

                  return (
                    <button
                      key={conv.id}
                      onClick={() => handleLoadConversation(conv.id)}
                      className={cn(
                        "group relative w-full rounded-lg px-3 py-3 text-left transition-all hover:bg-accent/50",
                        isActive && "bg-accent"
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Icon */}
                        <div className="mt-0.5 flex-shrink-0">
                          {isRoundtable ? (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted">
                              <Users className="h-3 w-3 text-muted-foreground" />
                            </div>
                          ) : infos[0] ? (
                            <div className="h-5 w-5 overflow-hidden rounded-full border border-border/50">
                              <Image
                                src={infos[0].avatar}
                                alt={infos[0].name}
                                width={20}
                                height={20}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ) : null}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h3 className="truncate text-sm font-medium">
                              {conv.title ||
                                (isRoundtable ? "圆桌讨论" : "新对话")}
                            </h3>
                            {isRoundtable && (
                              <span className="flex-shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                                圆桌
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1">
                            <span className="truncate text-xs text-muted-foreground">
                              {infos.map((p) => p!.name).join("、")}
                            </span>
                            <span className="text-[10px] text-muted-foreground/60">
                              ·
                            </span>
                            <span className="flex-shrink-0 text-[10px] text-muted-foreground/60">
                              {formatDate(conv.updatedAt)}
                            </span>
                          </div>
                          <div className="mt-1 text-[10px] text-muted-foreground/50">
                            {conv.messageCount} 条消息
                          </div>
                        </div>

                        {/* Delete button */}
                        <button
                          onClick={(e) => handleDelete(e, conv.id)}
                          className="mt-0.5 flex-shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          title="删除对话"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

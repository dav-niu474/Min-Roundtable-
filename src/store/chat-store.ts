"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Personality } from "@/lib/personalities";
import { DEFAULT_MODEL } from "@/lib/nvidia";

// ─── Types ───────────────────────────────────────────────

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  personalityId?: string;
  personalityName?: string;
  personalityColor?: string;
  timestamp: number;
  dbId?: string; // Supabase message UUID
}

export interface Conversation {
  id: string;
  type: "chat" | "roundtable";
  title: string | null;
  personalityIds: string[];
  model: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

type AppMode = "landing" | "chat" | "roundtable";

interface ChatState {
  // Mode
  mode: AppMode;

  // Current session
  sessionId: string;

  // Conversation persistence
  currentConversationId: string | null;
  conversations: Conversation[];
  _pendingConvId: Promise<string | null> | null;

  // Current chat state
  activePersonality: Personality | null;
  roundtableMembers: Personality[];
  roundtableSelected: Set<string>;
  messages: Message[];
  isLoading: boolean;
  streamingPersonalityId: string | null;
  streamingMessageDbId: string | null;
  selectedModel: string;

  // Actions
  setMode: (mode: AppMode) => void;
  initSession: () => string;
  startChat: (personality: Personality) => void;
  startRoundtable: (members: Personality[]) => void;
  loadConversation: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  fetchConversations: () => Promise<void>;

  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  appendToMessage: (id: string, content: string) => void;
  setLoading: (loading: boolean) => void;
  setStreamingPersonality: (id: string | null) => void;
  setStreamingMessageDbId: (id: string | null) => void;

  toggleRoundtableSelection: (personalityId: string) => void;
  clearSelection: () => void;
  clearChat: () => void;
  goHome: () => void;
  setSelectedModel: (model: string) => void;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = localStorage.getItem("mind-roundtable-session");
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem("mind-roundtable-session", sid);
  }
  return sid;
}

// ─── DB helpers ──────────────────────────────────────────

async function apiCreateConversation(params: {
  session_id: string;
  type: "chat" | "roundtable";
  personality_ids: string[];
  model: string;
  title?: string;
}): Promise<Conversation> {
  const res = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Failed to create conversation");
  const { conversation } = await res.json();
  return conversation as Conversation;
}

async function apiFetchConversations(sessionId: string): Promise<Conversation[]> {
  const res = await fetch(`/api/conversations?session_id=${encodeURIComponent(sessionId)}`);
  if (!res.ok) return [];
  const { conversations } = await res.json();
  return (conversations || []) as Conversation[];
}

async function apiLoadConversation(id: string): Promise<{
  conversation: Conversation;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    personality_id?: string;
    personality_name?: string;
    personality_color?: string;
    created_at: string;
  }>;
}> {
  const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Failed to load conversation");
  return res.json();
}

async function apiDeleteConversation(id: string): Promise<void> {
  const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete conversation");
}

async function apiSaveMessage(
  conversationId: string,
  msg: {
    role: "user" | "assistant";
    content: string;
    personality_id?: string;
    personality_name?: string;
    personality_color?: string;
  }
): Promise<string> {
  const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  });
  if (!res.ok) throw new Error("Failed to save message");
  const { message } = await res.json();
  return message.id as string;
}

async function apiUpdateMessageContent(
  messageId: string,
  content: string
): Promise<void> {
  const res = await fetch(`/api/messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("Failed to update message");
}

// Debounce timers for streaming DB updates
const _streamTimers: Record<string, ReturnType<typeof setTimeout>> = {};

// ─── Store ───────────────────────────────────────────────

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      mode: "landing",
      sessionId: "",
      currentConversationId: null,
      conversations: [],
      _pendingConvId: null,
      activePersonality: null,
      roundtableMembers: [],
      roundtableSelected: new Set<string>(),
      messages: [],
      isLoading: false,
      streamingPersonalityId: null,
      streamingMessageDbId: null,
      selectedModel: DEFAULT_MODEL,

      setMode: (mode) => set({ mode }),

      initSession: () => {
        const sid = getSessionId();
        set({ sessionId: sid });
        get().fetchConversations();
        return sid;
      },

      startChat: (personality) => {
        const state = get();
        const sid = state.sessionId || getSessionId();

        // Create conversation promise FIRST to avoid race conditions
        const convPromise = apiCreateConversation({
          session_id: sid,
          type: "chat",
          personality_ids: [personality.id],
          model: state.selectedModel,
        });

        set({
          sessionId: sid,
          mode: "chat",
          activePersonality: personality,
          messages: [],
          isLoading: false,
          currentConversationId: null,
          streamingMessageDbId: null,
          _pendingConvId: convPromise
            .then((c) => {
              set({ currentConversationId: c.id, _pendingConvId: null });
              get().fetchConversations();
              return c.id;
            })
            .catch((err) => {
              console.error("[startChat] create conversation failed:", err);
              set({ _pendingConvId: null });
              return null;
            }),
        });
      },

      startRoundtable: (members) => {
        const state = get();
        const sid = state.sessionId || getSessionId();

        const convPromise = apiCreateConversation({
          session_id: sid,
          type: "roundtable",
          personality_ids: members.map((m) => m.id),
          model: state.selectedModel,
        });

        set({
          sessionId: sid,
          mode: "roundtable",
          roundtableMembers: members,
          messages: [],
          isLoading: false,
          roundtableSelected: new Set<string>(),
          currentConversationId: null,
          streamingMessageDbId: null,
          _pendingConvId: convPromise
            .then((c) => {
              set({ currentConversationId: c.id, _pendingConvId: null });
              get().fetchConversations();
              return c.id;
            })
            .catch((err) => {
              console.error("[startRoundtable] create conv failed:", err);
              set({ _pendingConvId: null });
              return null;
            }),
        });
      },

      loadConversation: async (conversationId: string) => {
        try {
          const { conversation, messages: dbMessages } = await apiLoadConversation(conversationId);
          const { personalities } = await import("@/lib/personalities");

          const localMessages: Message[] = dbMessages.map((m) => ({
            id: crypto.randomUUID(),
            role: m.role,
            content: m.content,
            personalityId: m.personality_id || undefined,
            personalityName: m.personality_name || undefined,
            personalityColor: m.personality_color || undefined,
            timestamp: new Date(m.created_at).getTime(),
            dbId: m.id,
          }));

          if (conversation.type === "chat") {
            const personalityId = conversation.personalityIds[0];
            const personality = personalities.find((p) => p.id === personalityId) || null;
            set({
              mode: "chat",
              activePersonality: personality,
              messages: localMessages,
              currentConversationId: conversation.id,
              selectedModel: conversation.model,
              isLoading: false,
              _pendingConvId: null,
            });
          } else {
            const members = conversation.personalityIds
              .map((pid) => personalities.find((p) => p.id === pid))
              .filter(Boolean) as Personality[];
            set({
              mode: "roundtable",
              roundtableMembers: members,
              messages: localMessages,
              currentConversationId: conversation.id,
              selectedModel: conversation.model,
              isLoading: false,
              roundtableSelected: new Set<string>(),
              _pendingConvId: null,
            });
          }
        } catch (err) {
          console.error("[loadConversation]", err);
        }
      },

      deleteConversation: async (conversationId: string) => {
        try {
          await apiDeleteConversation(conversationId);
          const state = get();
          const updated = state.conversations.filter((c) => c.id !== conversationId);
          set({ conversations: updated });
          if (state.currentConversationId === conversationId) {
            get().goHome();
          }
        } catch (err) {
          console.error("[deleteConversation]", err);
        }
      },

      fetchConversations: async () => {
        const state = get();
        if (!state.sessionId) return;
        try {
          const convs = await apiFetchConversations(state.sessionId);
          set({ conversations: convs });
        } catch (err) {
          console.error("[fetchConversations]", err);
        }
      },

      addMessage: (message) => {
        set((state) => ({ messages: [...state.messages, message] }));

        // Save to DB — wait for conversation ID if needed
        const state = get();
        const convId = state.currentConversationId;

        const doSave = (cid: string) => {
          if (!cid || !message.content) return;
          apiSaveMessage(cid, {
            role: message.role,
            content: message.content,
            personality_id: message.personalityId,
            personality_name: message.personalityName,
            personality_color: message.personalityColor,
          })
            .then((dbId) => {
              set((s) => ({
                messages: s.messages.map((m) =>
                  m.id === message.id ? { ...m, dbId } : m
                ),
              }));
              if (message.role === "assistant") {
                set({ streamingMessageDbId: dbId });
              }
              get().fetchConversations();
            })
            .catch((err) => console.error("[addMessage] save failed:", err));
        };

        if (convId) {
          doSave(convId);
        } else if (state._pendingConvId) {
          state._pendingConvId.then((id) => id && doSave(id));
        }
      },

      updateMessage: (id, content) => {
        set((state) => ({
          messages: state.messages.map((m) => (m.id === id ? { ...m, content } : m)),
        }));

        const state = get();
        const msg = state.messages.find((m) => m.id === id);
        if (msg?.dbId) {
          apiUpdateMessageContent(msg.dbId, content).catch((err) =>
            console.error("[updateMessage] DB update failed:", err)
          );
        }
      },

      appendToMessage: (id, content) => {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, content: m.content + content } : m
          ),
        }));

        // Debounced DB update
        const state = get();
        const msg = state.messages.find((m) => m.id === id);
        const dbId = msg?.dbId || state.streamingMessageDbId;
        if (dbId && msg?.content) {
          if (_streamTimers[dbId]) clearTimeout(_streamTimers[dbId]);
          _streamTimers[dbId] = setTimeout(() => {
            apiUpdateMessageContent(dbId, msg.content).catch(() => {});
            delete _streamTimers[dbId];
          }, 500);
        }
      },

      setLoading: (loading) => set({ isLoading: loading }),
      setStreamingPersonality: (id) => set({ streamingPersonalityId: id }),
      setStreamingMessageDbId: (id) => set({ streamingMessageDbId: id }),

      toggleRoundtableSelection: (personalityId) =>
        set((state) => {
          const next = new Set(state.roundtableSelected);
          if (next.has(personalityId)) {
            next.delete(personalityId);
          } else {
            next.add(personalityId);
          }
          return { roundtableSelected: next };
        }),

      clearSelection: () => set({ roundtableSelected: new Set<string>() }),

      clearChat: () =>
        set({
          messages: [],
          isLoading: false,
          streamingPersonalityId: null,
          streamingMessageDbId: null,
        }),

      goHome: () =>
        set({
          mode: "landing",
          activePersonality: null,
          roundtableMembers: [],
          roundtableSelected: new Set<string>(),
          messages: [],
          isLoading: false,
          streamingPersonalityId: null,
          streamingMessageDbId: null,
          currentConversationId: null,
          _pendingConvId: null,
        }),

      setSelectedModel: (model) => set({ selectedModel: model }),
    }),
    {
      name: "mind-roundtable-prefs",
      partialize: (state) => ({
        selectedModel: state.selectedModel,
        sessionId: state.sessionId,
      }),
    }
  )
);

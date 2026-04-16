"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Personality } from "@/lib/personalities";
import { DEFAULT_MODEL } from "@/lib/nvidia";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  personalityId?: string;
  personalityName?: string;
  personalityColor?: string;
  timestamp: number;
}

type AppMode = "landing" | "chat" | "roundtable";

interface ChatState {
  mode: AppMode;
  activePersonality: Personality | null;
  roundtableMembers: Personality[];
  roundtableSelected: Set<string>;
  messages: Message[];
  isLoading: boolean;
  streamingPersonalityId: string | null;
  selectedModel: string;

  setMode: (mode: AppMode) => void;
  startChat: (personality: Personality) => void;
  startRoundtable: (members: Personality[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  appendToMessage: (id: string, content: string) => void;
  setLoading: (loading: boolean) => void;
  setStreamingPersonality: (id: string | null) => void;
  toggleRoundtableSelection: (personalityId: string) => void;
  clearSelection: () => void;
  clearChat: () => void;
  goHome: () => void;
  setSelectedModel: (model: string) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      mode: "landing",
      activePersonality: null,
      roundtableMembers: [],
      roundtableSelected: new Set<string>(),
      messages: [],
      isLoading: false,
      streamingPersonalityId: null,
      selectedModel: DEFAULT_MODEL,

      setMode: (mode) => set({ mode }),
      startChat: (personality) =>
        set({
          mode: "chat",
          activePersonality: personality,
          messages: [],
          isLoading: false,
        }),
      startRoundtable: (members) =>
        set({
          mode: "roundtable",
          roundtableMembers: members,
          messages: [],
          isLoading: false,
          roundtableSelected: new Set<string>(),
        }),
      addMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message] })),
      updateMessage: (id, content) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, content } : m
          ),
        })),
      appendToMessage: (id, content) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, content: m.content + content } : m
          ),
        })),
      setLoading: (loading) => set({ isLoading: loading }),
      setStreamingPersonality: (id) => set({ streamingPersonalityId: id }),
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
        }),
      setSelectedModel: (model) => set({ selectedModel: model }),
    }),
    {
      name: "mind-roundtable-prefs",
      partialize: (state) => ({ selectedModel: state.selectedModel }),
    }
  )
);

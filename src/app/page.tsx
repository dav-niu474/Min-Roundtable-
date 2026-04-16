"use client";

import { useChatStore } from "@/store/chat-store";
import Landing from "@/components/landing";
import ChatView from "@/components/chat-view";
import RoundtableView from "@/components/roundtable-view";
import { AnimatePresence, motion } from "framer-motion";

export default function Home() {
  const { mode } = useChatStore();

  return (
    <AnimatePresence mode="wait">
      {mode === "landing" && (
        <motion.div
          key="landing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Landing />
        </motion.div>
      )}
      {mode === "chat" && (
        <motion.div
          key="chat"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <ChatView />
        </motion.div>
      )}
      {mode === "roundtable" && (
        <motion.div
          key="roundtable"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <RoundtableView />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

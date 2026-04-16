import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "思想圆桌 · Mind Roundtable",
  description: "与人类最伟大的思想家对话 — 乔布斯、马斯克、芒格、费曼、纳瓦尔、塔勒布、Paul Graham、张一鸣。基于女娲思维蒸馏的 AI Agent 系统。",
  keywords: ["AI", "思想家", "乔布斯", "马斯克", "芒格", "费曼", "圆桌", "思维蒸馏", "Nuwa"],
  authors: [{ name: "Z.ai" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "思想圆桌 · Mind Roundtable",
    description: "与人类最伟大的思想家对话 — Distilled Thinking Systems",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

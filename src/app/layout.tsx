import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 狼人杀 · 和 6 个 AI 同桌",
  description:
    "1 个人类玩家 + 6 个 LLM 玩家的狼人杀：AI 各有人设与隐藏身份，会伪装、推理、抱团投票。",
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-slate-950 text-slate-100">
        {children}
      </body>
    </html>
  );
}

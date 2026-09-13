"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

const ROLES = ["狼人 ×2", "预言家 ×1", "村民 ×4"];

export default function Home() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const startGame = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ humanName: name.trim() || "你" }),
      });
      const data = await res.json();
      if (data.id) router.push(`/game/${data.id}`);
      else setCreating(false);
    } catch {
      setCreating(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-12 p-8">
      <div className="text-center space-y-5">
        <div className="text-6xl sm:text-7xl" aria-hidden>
          🌙
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-wide">AI 狼人杀</h1>
        <p className="text-slate-400 max-w-md mx-auto leading-relaxed">
          你和 6 个 LLM 玩家同桌。它们各有人设、各怀鬼胎——
          会伪装、会推理、会在天亮时把刀口指向你。
        </p>
      </div>

      <ul className="flex flex-wrap justify-center gap-2 text-sm">
        {ROLES.map((role) => (
          <li key={role} className="rounded-full border border-slate-800 bg-slate-900 px-4 py-1.5 text-slate-300">
            {role}
          </li>
        ))}
      </ul>

      <div className="w-full max-w-xs space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={12}
          placeholder="你的游戏昵称（可选）"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-center outline-none focus:ring-1 ring-amber-500"
        />
        <button
          onClick={startGame}
          disabled={creating}
          className="w-full h-12 rounded-xl bg-amber-500 font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
        >
          {creating ? "正在开局面……" : "开始游戏"}
        </button>
      </div>

      <div className="flex gap-6 text-sm">
        <Link href="/replay" className="text-slate-400 hover:text-slate-200 underline-offset-4 hover:underline">
          观看 AI 回放
        </Link>
        <Link href="/stats" className="text-slate-400 hover:text-slate-200 underline-offset-4 hover:underline">
          成本看板
        </Link>
      </div>

      <footer className="text-xs text-slate-600 text-center">
        7 人局 · 信息隔离的上下文构建 · 确定性规则引擎 · 对局可回放
      </footer>
    </main>
  );
}

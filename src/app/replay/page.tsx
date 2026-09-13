"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface GameRow {
  id: string;
  winner: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function ReplayListPage() {
  const [games, setGames] = useState<GameRow[] | null>(null);

  useEffect(() => {
    fetch("/api/games")
      .then((r) => r.json())
      .then((d) => setGames(d.games ?? []))
      .catch(() => setGames([]));
  }, []);

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🎬 AI 对局回放</h1>
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-200">
          返回首页
        </Link>
      </div>
      {games === null ? (
        <p className="text-slate-500">加载中……</p>
      ) : games.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 p-8 text-center text-slate-500">
          还没有已结束的对局。去 <Link href="/" className="text-amber-400">开一局</Link>，或者跑几轮自动对局（
          <code className="text-xs">npm run eval</code>）再来。
        </div>
      ) : (
        <ul className="space-y-2">
          {games.map((g) => (
            <li key={g.id}>
              <Link
                href={`/replay/${g.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 hover:border-slate-600 transition"
              >
                <div>
                  <div className="text-sm text-slate-200">{g.id}</div>
                  <div className="text-xs text-slate-500">{new Date(g.updatedAt).toLocaleString("zh-CN")}</div>
                </div>
                <span className={`text-sm font-semibold ${g.winner === "wolf" ? "text-red-400" : "text-emerald-400"}`}>
                  {g.winner === "wolf" ? "🐺 狼人胜" : "🌅 好人胜"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

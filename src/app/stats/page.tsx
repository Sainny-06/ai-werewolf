"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  mode: "glm" | "mock";
  totalCalls: number;
  totalTokens: number;
  fallbacks: number;
  finishedGames: number;
  byFeature: { feature: string; count: number; totalTokens: number; avgLatencyMs: number; fallbacks: number }[];
  byModel: { model: string; provider: string; count: number; totalTokens: number }[];
}

const FEATURE_LABEL: Record<string, string> = {
  speech: "白天发言",
  last_words: "遗言",
  vote: "投票",
  wolf_kill: "狼人刀口",
  seer_check: "预言家查验",
};

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <main className="min-h-screen max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">💰 Token 成本看板</h1>
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-200">
          返回首页
        </Link>
      </div>

      {!stats ? (
        <p className="text-slate-500">加载中……</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
              <div className="text-xs text-slate-500">运行模式</div>
              <div className={`text-lg font-bold ${stats.mode === "glm" ? "text-emerald-400" : "text-slate-300"}`}>
                {stats.mode === "glm" ? "GLM 真实模型" : "Mock 基线"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
              <div className="text-xs text-slate-500">LLM 调用</div>
              <div className="text-lg font-bold">{stats.totalCalls}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
              <div className="text-xs text-slate-500">总 Tokens</div>
              <div className="text-lg font-bold">{stats.totalTokens.toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
              <div className="text-xs text-slate-500">完成对局</div>
              <div className="text-lg font-bold">{stats.finishedGames}</div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-300 mb-3">按功能维度（模型路由的依据）</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 text-left">
                  <th className="py-1">功能</th>
                  <th>调用</th>
                  <th>Tokens</th>
                  <th>均延迟</th>
                  <th>兜底</th>
                </tr>
              </thead>
              <tbody>
                {stats.byFeature.map((f) => (
                  <tr key={f.feature} className="border-t border-slate-800">
                    <td className="py-1.5 text-slate-200">{FEATURE_LABEL[f.feature] ?? f.feature}</td>
                    <td className="text-center text-slate-400">{f.count}</td>
                    <td className="text-center text-slate-400">{f.totalTokens.toLocaleString()}</td>
                    <td className="text-center text-slate-400">{f.avgLatencyMs}ms</td>
                    <td className={`text-center ${f.fallbacks > 0 ? "text-amber-400" : "text-slate-600"}`}>{f.fallbacks}</td>
                  </tr>
                ))}
                {stats.byFeature.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 text-center text-slate-600">
                      暂无调用记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-300 mb-3">按模型维度</h2>
            <ul className="space-y-1 text-sm">
              {stats.byModel.map((m) => (
                <li key={m.model} className="flex justify-between border-t border-slate-800 py-1.5">
                  <span className="text-slate-200">
                    {m.model} <span className="text-xs text-slate-500">({m.provider})</span>
                  </span>
                  <span className="text-slate-400">
                    {m.count} 次 · {m.totalTokens.toLocaleString()} tokens
                  </span>
                </li>
              ))}
              {stats.byModel.length === 0 && <li className="py-3 text-center text-slate-600">暂无调用记录</li>}
            </ul>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            模型路由：发言/遗言类走免费 flash 模型，投票/刀口/查验等决策类走配置的决策模型（LLM_MODEL_DECIDE）。
            真实 GLM 计费下本页可换算出每局成本（GLM 计价见开放平台文档）。
          </p>
        </div>
      )}
    </main>
  );
}

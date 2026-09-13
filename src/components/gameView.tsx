"use client";

import type { PublicState } from "@/lib/game/publicState";
import type { GameEvent } from "@/lib/game/types";

export const PHASE_LABEL: Record<string, string> = {
  setup: "准备中",
  night_wolf: "夜 · 狼人行动",
  night_seer: "夜 · 预言家行动",
  dawn: "黎明",
  speech: "白天 · 发言",
  vote: "白天 · 投票",
  pk_speech: "PK · 辩护",
  pk_vote: "PK · 投票",
  game_over: "终局",
};

export const AVATARS = ["🐯", "🐰", "🦊", "🐻", "🦉", "🐺", "🧑‍🌾"];

const ROLE_NAME: Record<string, string> = { wolf: "狼人", seer: "预言家", villager: "村民" };

export function isNight(phase: string): boolean {
  return phase === "night_wolf" || phase === "night_seer";
}

export function PlayerStrip({ state, meId }: { state: PublicState; meId: number | null }) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
      {state.players.map((p) => {
        const isMe = p.id === meId;
        const teammates = state.me?.teammates.includes(p.id) ?? false;
        return (
          <div
            key={p.id}
            className={`rounded-xl border p-2 text-center transition-all ${
              !p.alive
                ? "border-slate-800 bg-slate-900/50 opacity-40 grayscale"
                : isNight(state.phase)
                  ? "border-indigo-900 bg-indigo-950/60"
                  : "border-slate-700 bg-slate-900"
            } ${isMe ? "ring-2 ring-amber-400" : teammates ? "ring-1 ring-red-500/60" : ""}`}
          >
            <div className="text-2xl" aria-hidden>
              {p.alive ? AVATARS[(p.id - 1) % AVATARS.length] : "💀"}
            </div>
            <div className="text-xs font-medium text-slate-200 truncate">
              {p.id}号 · {p.name}
              {isMe && <span className="text-amber-400">（你）</span>}
            </div>
            {p.role && (
              <div
                className={`text-[10px] mt-0.5 ${
                  p.role === "wolf" ? "text-red-400" : p.role === "seer" ? "text-sky-400" : "text-emerald-400"
                }`}
              >
                {ROLE_NAME[p.role]}
              </div>
            )}
            {!p.alive && <div className="text-[10px] text-slate-500">出局</div>}
          </div>
        );
      })}
    </div>
  );
}

export function EventLog({
  events,
  names,
  upTo,
  streaming,
}: {
  events: GameEvent[];
  names: Record<number, string>;
  upTo?: number;
  streaming?: { player: number; text: string } | null;
}) {
  const shown = upTo === undefined ? events : events.slice(0, upTo);
  const nodes: React.ReactNode[] = [];

  shown.forEach((e, i) => {
    switch (e.type) {
      case "game_start":
        nodes.push(
          <div key={i} className="text-center text-xs text-slate-500">
            —— 对局开始 ——
          </div>
        );
        break;
      case "night_start":
        nodes.push(
          <div key={i} className="flex items-center gap-2 my-3">
            <div className="h-px flex-1 bg-indigo-900" />
            <span className="text-xs text-indigo-400">🌙 第 {e.day} 夜 · 天黑请闭眼</span>
            <div className="h-px flex-1 bg-indigo-900" />
          </div>
        );
        break;
      case "dawn":
        nodes.push(
          <div key={i} className="flex items-center gap-2 my-3">
            <div className="h-px flex-1 bg-amber-900" />
            <span className="text-xs text-amber-400">
              🌅 第 {e.day} 天 ·{" "}
              {e.deaths.length > 0 ? `${e.deaths.map((d) => `${d}号（${names[d]}）`).join("、")} 出局` : "平安夜"}
            </span>
            <div className="h-px flex-1 bg-amber-900" />
          </div>
        );
        break;
      case "speech":
      case "last_words": {
        const isLast = e.type === "last_words";
        nodes.push(
          <div key={i} className={`flex gap-2 ${isLast ? "opacity-80" : ""}`}>
            <div className="shrink-0 w-14 text-right text-xs text-slate-500 pt-1">
              {e.player}号
              {isLast && <div className="text-[10px] text-rose-400">遗言</div>}
            </div>
            <div className="rounded-xl bg-slate-800/80 px-3 py-2 text-sm text-slate-100 max-w-[85%]">
              {e.content}
            </div>
          </div>
        );
        break;
      }
      case "vote_result":
        nodes.push(
          <div key={i} className="mx-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-xs text-slate-400 space-y-1">
            <div className="text-slate-300">
              {e.isPk ? "⚖️ PK 投票" : "🗳️ 投票"}：
              {e.votes
                .map((v) => `${v.voter}号→${v.target === null ? "弃票" : `${v.target}号`}${v.reason ? `「${v.reason}」` : ""}`)
                .join("，")}
            </div>
            <div className={e.exiled === null ? "text-slate-500" : "text-rose-400"}>
              {e.exiled === null ? "结果：无人出局" : `结果：${e.exiled}号（${names[e.exiled]}）被放逐出局`}
            </div>
          </div>
        );
        break;
      case "exile":
        break; // 已并入 vote_result 展示
      case "game_over":
        nodes.push(
          <div key={i} className="text-center text-sm font-semibold py-2">
            {e.winner === "wolf" ? (
              <span className="text-red-400">🐺 狼人阵营获胜！</span>
            ) : (
              <span className="text-emerald-400">🌅 好人阵营获胜！</span>
            )}
          </div>
        );
        break;
      default:
        break;
    }
  });

  if (streaming) {
    nodes.push(
      <div key="streaming" className="flex gap-2">
        <div className="shrink-0 w-14 text-right text-xs text-slate-500 pt-1">{streaming.player}号</div>
        <div className="rounded-xl bg-slate-800/80 px-3 py-2 text-sm text-slate-100 max-w-[85%]">
          {streaming.text}
          <span className="animate-pulse">▌</span>
        </div>
      </div>
    );
  }

  return <div className="flex flex-col gap-2">{nodes}</div>;
}

export function WinnerBanner({ state }: { state: PublicState }) {
  if (!state.gameOver || !state.winner) return null;
  return (
    <div
      className={`rounded-2xl p-4 text-center ${
        state.winner === "wolf" ? "bg-red-950/60 border border-red-800" : "bg-emerald-950/60 border border-emerald-800"
      }`}
    >
      <div className="text-lg font-bold">
        {state.winner === "wolf" ? "🐺 狼人阵营获胜" : "🌅 好人阵营获胜"}
      </div>
      <div className="text-xs text-slate-400 mt-1">
        身份揭示：
        {state.players.map((p) => `${p.id}号=${p.role === "wolf" ? "狼" : p.role === "seer" ? "预言家" : "民"}`).join("，")}
      </div>
    </div>
  );
}

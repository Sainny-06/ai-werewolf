"use client";

import React from "react";
import type { PublicState } from "@/lib/game/publicState";
import type { GameEvent } from "@/lib/game/types";

export const PHASE_LABEL: Record<string, string> = {
  setup: "准备中",
  night_wolf: "夜 · 狼人行动",
  night_seer: "夜 · 预言家行动",
  dawn: "黎明",
  speech: "白天 · 讨论",
  vote: "白天 · 投票",
  pk_speech: "PK · 辩护",
  pk_vote: "PK · 投票",
  game_over: "终局",
};

export const PHASE_HINT: Record<string, string> = {
  setup: "正在创建对局……",
  night_wolf: "黑夜降临，狼人正在选择目标……",
  night_seer: "预言家正在查验身份……",
  dawn: "天亮了，公布昨晚的消息",
  speech: "白天讨论，按座位顺序轮流发言",
  vote: "讨论结束，投票放逐一名嫌疑人",
  pk_speech: "平票！候选人做最后辩护",
  pk_vote: "PK 投票，决定谁出局",
  game_over: "对局结束",
};

export const AVATARS = ["🐯", "🐰", "🦊", "🐻", "🦉", "🐺", "🧑‍🌾"];
export const SEAT_COLORS = [
  "border-amber-500",
  "border-emerald-500",
  "border-sky-500",
  "border-violet-500",
  "border-rose-500",
  "border-orange-500",
  "border-teal-500",
];

const ROLE_NAME: Record<string, string> = { wolf: "狼人", seer: "预言家", villager: "村民" };
const ROLE_CHIP: Record<string, string> = {
  wolf: "bg-red-500/20 text-red-300",
  seer: "bg-sky-500/20 text-sky-300",
  villager: "bg-emerald-500/20 text-emerald-300",
};

export function isNight(phase: string): boolean {
  return phase === "night_wolf" || phase === "night_seer" || phase === "setup";
}

/** 左侧玩家列表：头像、状态、当前发言指示 */
export function PlayerList({
  state,
  meId,
  streamingPlayer,
}: {
  state: PublicState;
  meId: number | null;
  streamingPlayer: number | null;
}) {
  const activeId = streamingPlayer ?? state.speechTurn;
  return (
    <div className="space-y-1.5">
      {state.players.map((p) => {
        const isMe = p.id === meId;
        const isTeammate = state.me?.teammates.includes(p.id) ?? false;
        const speaking = p.id === activeId;
        return (
          <div
            key={p.id}
            className={`flex items-center gap-2.5 rounded-xl border bg-slate-900/70 px-2.5 py-2 transition-all duration-300 ${SEAT_COLORS[(p.id - 1) % SEAT_COLORS.length]} border-l-4 ${
              !p.alive ? "opacity-40 grayscale" : ""
            } ${speaking ? "ring-2 ring-amber-400 shadow-lg shadow-amber-500/10" : ""}`}
          >
            <div className="text-xl leading-none" aria-hidden>
              {p.alive ? AVATARS[(p.id - 1) % AVATARS.length] : "💀"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-100">
                <span className="truncate">
                  {p.id}号 · {p.name}
                </span>
                {isMe && <span className="rounded bg-amber-500 px-1 text-[10px] font-bold text-slate-950">你</span>}
                {isTeammate && <span className="rounded bg-red-500/80 px-1 text-[10px] font-bold text-white">队友</span>}
              </div>
              {!p.alive ? (
                <div className="text-[11px] text-slate-500">已出局</div>
              ) : speaking ? (
                <div className="flex items-center gap-1 text-[11px] text-amber-400">
                  <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-amber-400" />
                  正在发言
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">{p.persona.slice(0, 14)}…</div>
              )}
            </div>
            {p.role && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${ROLE_CHIP[p.role]}`}>{ROLE_NAME[p.role]}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 事件流：发言气泡 + 系统消息 */
export function EventLog({
  events,
  names,
  streaming,
}: {
  events: GameEvent[];
  names: Record<number, string>;
  streaming?: { player: number; text: string } | null;
}) {
  const nodes: React.ReactNode[] = [];

  const bubble = (key: React.Key, player: number, content: string, tag?: string) => (
    <div key={key} className="flex gap-2.5">
      <div className="flex flex-col items-center pt-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-sm" aria-hidden>
          {AVATARS[(player - 1) % AVATARS.length]}
        </div>
      </div>
      <div className="max-w-[86%]">
        <div className="mb-0.5 text-[11px] text-slate-500">
          {player}号 · {names[player]}
          {tag && <span className="ml-1.5 rounded bg-rose-500/20 px-1 text-rose-300">{tag}</span>}
        </div>
        <div className="inline-block rounded-2xl rounded-tl-sm bg-slate-800/90 px-3.5 py-2 text-[15px] leading-relaxed text-slate-50">
          {content}
        </div>
      </div>
    </div>
  );

  events.forEach((e, i) => {
    switch (e.type) {
      case "game_start":
        nodes.push(
          <div key={i} className="my-2 text-center text-xs text-slate-500">
            —— 对局开始，身份已秘密发放 ——
          </div>
        );
        break;
      case "night_start":
        nodes.push(
          <div key={i} className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-indigo-800/60" />
            <span className="rounded-full bg-indigo-950/80 px-4 py-1 text-xs text-indigo-300">
              🌙 第 {e.day} 夜 · 天黑请闭眼
            </span>
            <div className="h-px flex-1 bg-indigo-800/60" />
          </div>
        );
        break;
      case "dawn":
        nodes.push(
          <div key={i} className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-amber-800/50" />
            <span className="rounded-full bg-amber-950/70 px-4 py-1 text-xs text-amber-300">
              🌅 第 {e.day} 天 ·{" "}
              {e.deaths.length > 0 ? `${e.deaths.map((d) => `${d}号（${names[d]}）`).join("、")} 出局` : "平安夜"}
            </span>
            <div className="h-px flex-1 bg-amber-800/50" />
          </div>
        );
        break;
      case "speech":
        nodes.push(bubble(i, e.player, e.content));
        break;
      case "last_words":
        nodes.push(bubble(i, e.player, e.content, "遗言"));
        break;
      case "vote_result":
        nodes.push(
          <div key={i} className="ml-9 space-y-1.5 rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
            <div className="text-xs font-semibold text-slate-300">{e.isPk ? "⚖️ PK 投票" : "🗳️ 投票结果"}</div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {e.votes.map((v) => (
                <span key={v.voter} className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                  {v.voter}号 → {v.target === null ? "弃票" : `${v.target}号`}
                  {v.reason ? <span className="text-slate-500"> 「{v.reason}」</span> : null}
                  {v.fallback ? <span className="text-amber-500">（兜底）</span> : null}
                </span>
              ))}
            </div>
            <div className={`text-xs font-medium ${e.exiled === null ? "text-slate-500" : "text-rose-400"}`}>
              {e.exiled === null ? "本轮无人出局" : `${e.exiled}号（${names[e.exiled]}）被放逐出局`}
            </div>
          </div>
        );
        break;
      case "exile":
        break;
      case "game_over":
        nodes.push(
          <div key={i} className="my-2 text-center text-base font-bold py-1">
            {e.winner === "wolf" ? (
              <span className="text-red-400">🐺 狼人阵营获胜</span>
            ) : (
              <span className="text-emerald-400">🌅 好人阵营获胜</span>
            )}
          </div>
        );
        break;
      default:
        break;
    }
  });

  if (streaming) {
    nodes.push(bubble("streaming", streaming.player, streaming.text || "……"));
  }

  return <div className="flex flex-col gap-3">{nodes}</div>;
}

/** 轮到你了横幅 */
export function TurnBanner({ hint }: { hint: string }) {
  return (
    <div className="animate-pulse rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-center text-base font-bold text-slate-950 shadow-lg shadow-amber-500/20">
      🎯 {hint}
    </div>
  );
}

export function WinnerBanner({ state }: { state: PublicState }) {
  if (!state.gameOver || !state.winner) return null;
  return (
    <div
      className={`rounded-2xl p-4 text-center ${
        state.winner === "wolf"
          ? "border border-red-800 bg-red-950/60"
          : "border border-emerald-800 bg-emerald-950/60"
      }`}
    >
      <div className="text-lg font-bold">
        {state.winner === "wolf" ? "🐺 狼人阵营获胜" : "🌅 好人阵营获胜"}
      </div>
      <div className="mt-1 flex flex-wrap justify-center gap-1.5 text-xs">
        {state.players.map((p) => (
          <span key={p.id} className={`rounded-full px-2 py-0.5 ${ROLE_CHIP[p.role ?? "villager"]}`}>
            {p.id}号 {ROLE_NAME[p.role ?? "villager"]}
            {!p.alive && " ☠"}
          </span>
        ))}
      </div>
    </div>
  );
}

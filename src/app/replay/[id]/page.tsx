"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PublicState } from "@/lib/game/publicState";
import { EventLog, PlayerList, WinnerBanner, isNight } from "@/components/gameView";

/**
 * 回放页：逐事件还原对局。身份在"game_over"事件出现前保持隐藏（不翻牌规则），
 * 夜间私有事件（狼刀/查验）也只在终局揭示后展示。
 */
export default function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [state, setState] = useState<PublicState | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(`/api/games/${id}`)
      .then((r) => r.json())
      .then((s: PublicState) => {
        setState(s);
        setCursor(s.events.length);
        setPlaying(true);
      })
      .catch(() => {});
  }, [id]);

  // 自动播放：每 1.4s 揭示一条事件
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!playing || !state) return;
    timer.current = setInterval(() => {
      setCursor((c) => {
        if (c >= state.events.length) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, 1400);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, state]);

  const revealedEvents = useMemo(() => {
    if (!state) return [];
    // 光标之前：只展示公开事件 + 已到终局则展示全部
    const sliced = state.events.slice(0, cursor);
    const overIdx = state.events.findIndex((e) => e.type === "game_over");
    const gameRevealed = overIdx >= 0 && cursor > overIdx;
    return gameRevealed ? sliced : sliced.filter((e) => e.type !== "wolf_kill" && e.type !== "seer_check");
  }, [state, cursor]);

  if (!state) {
    return <main className="min-h-screen flex items-center justify-center text-slate-500">加载中……</main>;
  }

  const names = Object.fromEntries(state.players.map((p) => [p.id, p.name]));
  const overIdx = state.events.findIndex((e) => e.type === "game_over");
  const fullyRevealed = overIdx >= 0 && cursor > overIdx;
  const displayState: PublicState = {
    ...state,
    events: revealedEvents,
    phase: cursor === 0 ? "setup" : state.events[cursor - 1].type === "night_start" ? "night_wolf" : state.phase,
    players: fullyRevealed
      ? state.players
      : state.players.map((p) => ({ ...p, role: undefined })),
  };

  return (
    <main className={`min-h-screen p-4 sm:p-6 max-w-3xl mx-auto ${isNight(displayState.phase) ? "bg-gradient-to-b from-indigo-950 to-slate-950" : ""}`}>
      <div className="flex items-center justify-between mb-4">
        <Link href="/replay" className="text-sm text-slate-500 hover:text-slate-300">
          ← 回放列表
        </Link>
        <span className="text-xs text-slate-500">{state.id}</span>
      </div>

      <PlayerList state={displayState} meId={null} streamingPlayer={null} />

      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 min-h-[320px] max-h-[50vh] overflow-y-auto">
        <EventLog events={revealedEvents} names={names} />
      </div>

      {/* 播放控制 */}
      <div className="mt-3 flex items-center justify-center gap-3 text-sm">
        <button onClick={() => setCursor((c) => Math.max(0, c - 1))} className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300">
          ◀ 上一条
        </button>
        <button
          onClick={() => {
            setPlaying((p) => !p);
          }}
          className="rounded-lg bg-amber-500 px-5 py-1.5 font-semibold text-slate-950"
        >
          {playing ? "⏸ 暂停" : "▶ 播放"}
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            setCursor((c) => Math.min(state.events.length, c + 1));
          }}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-300"
        >
          下一条 ▶
        </button>
        <button onClick={() => setCursor(state.events.length)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-400">
          跳到终局
        </button>
        <span className="text-xs text-slate-600">
          {cursor}/{state.events.length}
        </span>
      </div>

      <div className="mt-4">{fullyRevealed && <WinnerBanner state={state} />}</div>
    </main>
  );
}

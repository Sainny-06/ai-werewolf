"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PublicState } from "@/lib/game/publicState";
import type { HumanActionRequest } from "@/lib/game/types";
import {
  AVATARS,
  EventLog,
  PHASE_HINT,
  PHASE_LABEL,
  PlayerList,
  TurnBanner,
  WinnerBanner,
  isNight,
} from "@/components/gameView";

const ROLE_INFO: Record<string, { icon: string; label: string; cls: string }> = {
  wolf: { icon: "🐺", label: "狼人", cls: "border-red-800 bg-red-950/70 text-red-200" },
  seer: { icon: "🔮", label: "预言家", cls: "border-sky-800 bg-sky-950/70 text-sky-200" },
  villager: { icon: "👤", label: "村民", cls: "border-emerald-800 bg-emerald-950/70 text-emerald-200" },
};

const AWAITING_HINT: Record<string, string> = {
  speech: "轮到你了——请发言",
  last_words: "轮到你了——留下遗言",
  wolf_kill: "狼人回合——选择今晚的刀口",
  seer_check: "预言家回合——选择查验对象",
  vote: "投票环节——选出你最怀疑的人",
  pk_vote: "PK 投票——决定谁出局",
};

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [state, setState] = useState<PublicState | null>(null);
  const [awaiting, setAwaiting] = useState<HumanActionRequest | null>(null);
  const [streaming, setStreaming] = useState<{ player: number; text: string } | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const busy = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const pendingStream = useRef<{ player: number; text: string } | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/games/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((s: PublicState) => setState(s))
      .catch(() => setNotFound(true));
  }, [id]);

  // 智能滚动：仅在贴近底部时跟随（瞬时滚动，不用平滑动画，避免流式时的卡顿感）
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [state?.events.length, streaming?.text]);

  // 流式增量节流合并，~90ms 一帧，避免高频 setState 卡顿
  const pushDelta = useCallback((player: number, text: string) => {
    const p = pendingStream.current;
    if (p && p.player === player) p.text += text;
    else pendingStream.current = { player, text };
    if (!flushTimer.current) {
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        if (pendingStream.current) setStreaming({ ...pendingStream.current });
      }, 90);
    }
  }, []);

  const step = useCallback(async () => {
    const res = await fetch(`/api/games/${id}/step`, { method: "POST" });
    if (!res.body) {
      setError("服务器没有返回数据流");
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const msg = JSON.parse(line.slice(5).trim());
        if (msg.type === "delta") {
          pushDelta(msg.player, msg.text);
        } else if (msg.type === "result") {
          if (flushTimer.current) clearTimeout(flushTimer.current);
          flushTimer.current = null;
          pendingStream.current = null;
          setState(msg.state);
          setAwaiting(msg.awaiting);
          setStreaming(null);
        } else if (msg.type === "error") {
          setError(msg.message);
          setStreaming(null);
        }
      }
    }
  }, [id, pushDelta]);

  // 自动节拍循环：空闲且不需要人类输入时持续推进
  useEffect(() => {
    if (!state || state.gameOver || awaiting || streaming || busy.current) return;
    busy.current = true;
    step()
      .catch((e) => setError(String(e)))
      .finally(() => {
        busy.current = false;
        setState((s) => (s ? { ...s } : s));
      });
  }, [state, awaiting, streaming, step]);

  const act = async (kind: HumanActionRequest["kind"], target?: number | null, content?: string) => {
    setError(null);
    const res = await fetch(`/api/games/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, target, content }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "操作失败");
      return;
    }
    setState(data.state);
    setAwaiting(data.awaiting);
    setInput("");
  };

  if (notFound) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <p className="text-slate-400">对局不存在或已过期。</p>
        <Link href="/" className="text-amber-400 hover:underline">
          返回首页
        </Link>
      </main>
    );
  }
  if (!state) {
    return <main className="flex min-h-screen items-center justify-center text-slate-500">加载中……</main>;
  }

  const names = Object.fromEntries(state.players.map((p) => [p.id, p.name]));
  const aliveIds = state.players.filter((p) => p.alive).map((p) => p.id);
  const myId = state.me?.id ?? null;
  const night = isNight(state.phase);
  const roleInfo = state.me ? ROLE_INFO[state.me.role] : null;
  const queueWithTurn = state.speechTurn ? [state.speechTurn, ...state.speechQueue] : [];

  const targetButton = (c: number, onClick: () => void, tone: string) => (
    <button
      key={c}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition hover:scale-[1.03] ${tone}`}
    >
      <span aria-hidden>{AVATARS[(c - 1) % AVATARS.length]}</span>
      {c}号 · {names[c]}
    </button>
  );

  return (
    <main
      className={`min-h-screen transition-colors duration-1000 ${
        night ? "bg-gradient-to-b from-[#0b1026] via-slate-950 to-slate-950" : "bg-gradient-to-b from-slate-900 to-slate-950"
      }`}
    >
      <div className="mx-auto max-w-5xl px-3 pb-8 sm:px-6">
        {/* 顶栏 */}
        <header className="sticky top-0 z-10 -mx-3 mb-4 flex items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-950/85 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-300">
            🌙 <span className="hidden sm:inline">AI 狼人杀</span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">第 {Math.max(1, state.day)} 天</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                night ? "bg-indigo-500/20 text-indigo-300" : "bg-amber-500/20 text-amber-300"
              }`}
            >
              {PHASE_LABEL[state.phase] ?? state.phase}
            </span>
            {roleInfo && (
              <span className={`hidden items-center gap-1 rounded-full border px-3 py-1 text-xs sm:inline-flex ${roleInfo.cls}`}>
                {roleInfo.icon} 你的身份：{roleInfo.label}
              </span>
            )}
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[270px_1fr]">
          {/* 左栏：身份卡 + 玩家列表 */}
          <aside className="space-y-3">
            {state.me && !state.gameOver && (
              <div className={`rounded-2xl border p-3 ${roleInfo!.cls}`}>
                <div className="flex items-center gap-2 text-sm font-bold">
                  <span className="text-lg">{roleInfo!.icon}</span>你的身份：{roleInfo!.label}
                </div>
                {state.me.role === "wolf" && state.me.teammates.length > 0 && (
                  <div className="mt-1.5 text-xs opacity-90">
                    队友：{state.me.teammates.map((t) => `${t}号（${names[t]}）`).join("、")}
                  </div>
                )}
                {state.me.role === "seer" && state.me.seerKnowledge.length > 0 && (
                  <div className="mt-1.5 text-xs opacity-90">
                    查验：
                    {state.me.seerKnowledge.map((k) => `${k.target}号=${k.result === "wolf" ? "狼" : "好人"}`).join("，")}
                  </div>
                )}
                {state.me.wolfSuggestion && !awaiting && (
                  <div className="mt-1.5 text-xs italic opacity-80">队友建议：{state.me.wolfSuggestion}</div>
                )}
              </div>
            )}
            <PlayerList state={state} meId={myId} streamingPlayer={streaming?.player ?? null} />
            {queueWithTurn.length > 0 && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="mb-1.5 text-[11px] font-semibold text-slate-500">本轮发言顺序</div>
                <div className="flex flex-wrap items-center gap-1 text-xs text-slate-300">
                  {queueWithTurn.map((pid, i) => (
                    <span key={pid} className="flex items-center gap-1">
                      {i > 0 && <span className="text-slate-600">→</span>}
                      <span className={`rounded px-1.5 py-0.5 ${pid === myId ? "bg-amber-500 font-bold text-slate-950" : "bg-slate-800"}`}>
                        {pid}号
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* 右栏：事件流 + 行动区 */}
          <section className="space-y-3">
            <div
              ref={logRef}
              className="h-[44vh] overflow-y-auto rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 lg:h-[52vh]"
            >
              <EventLog events={state.events} names={names} streaming={streaming} />
            </div>

            {/* 状态条 */}
            {!state.gameOver && !awaiting && (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800/60 bg-slate-900/40 py-3 text-sm text-slate-400">
                {streaming ? (
                  <>
                    <span className="inline-block h-2 w-2 animate-ping rounded-full bg-amber-400" />
                    {streaming.player}号 正在发言……
                  </>
                ) : state.speechTurn ? (
                  <>
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-400" />
                    {state.speechTurn}号（{names[state.speechTurn]}）正在思考……
                  </>
                ) : (
                  <>
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate-500" />
                    {PHASE_HINT[state.phase] ?? "等待中……"}
                  </>
                )}
              </div>
            )}

            {state.me && !state.me.alive && !state.gameOver && (
              <div className="text-center text-xs text-slate-600">
                ☠ 你已出局——继续观战，看 AI 们如何收场。
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
                {error}
                <button className="ml-2 underline" onClick={() => setError(null)}>
                  知道了
                </button>
              </div>
            )}

            {/* 行动区 */}
            {state.gameOver ? (
              <div className="space-y-3">
                <WinnerBanner state={state} />
                <div className="flex justify-center gap-2">
                  <Link
                    href={`/replay/${state.id}`}
                    className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
                  >
                    回看本局
                  </Link>
                  <button
                    onClick={() =>
                      fetch("/api/games", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
                        .then((r) => r.json())
                        .then((d) => (window.location.href = `/game/${d.id}`))
                    }
                    className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    再来一局
                  </button>
                </div>
              </div>
            ) : awaiting ? (
              <div className="space-y-3">
                <TurnBanner hint={AWAITING_HINT[awaiting.kind] ?? "轮到你了"} />
                <div className="rounded-2xl border border-amber-900/50 bg-slate-900/80 p-4">
                  {awaiting.kind === "speech" && (
                    <>
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        maxLength={120}
                        rows={3}
                        autoFocus
                        placeholder="在这里输入你的发言（≤120字）——证明清白、分析局势、或者带带节奏……"
                        className="w-full resize-none rounded-xl bg-slate-800 p-3 text-[15px] leading-relaxed outline-none ring-amber-500/60 focus:ring-2"
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          disabled={!input.trim()}
                          onClick={() => act("speech", null, input)}
                          className="h-10 rounded-xl bg-amber-500 px-6 text-sm font-bold text-slate-950 disabled:opacity-40"
                        >
                          发言
                        </button>
                        <button
                          onClick={() => act("speech", null, "过")}
                          className="h-10 rounded-xl border border-slate-600 px-4 text-sm text-slate-300"
                        >
                          过
                        </button>
                        <span className="ml-auto text-xs text-slate-500">{input.length}/120</span>
                      </div>
                    </>
                  )}
                  {awaiting.kind === "last_words" && (
                    <>
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        maxLength={120}
                        rows={3}
                        autoFocus
                        placeholder="你出局了——留下最关键的情报……"
                        className="w-full resize-none rounded-xl bg-slate-800 p-3 text-[15px] outline-none ring-rose-500/60 focus:ring-2"
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          disabled={!input.trim()}
                          onClick={() => act("last_words", null, input)}
                          className="h-10 rounded-xl bg-rose-600 px-6 text-sm font-bold text-white disabled:opacity-40"
                        >
                          留下遗言
                        </button>
                        <span className="ml-auto text-xs text-slate-500">{input.length}/120</span>
                      </div>
                    </>
                  )}
                  {awaiting.kind === "wolf_kill" && (
                    <div className="flex flex-wrap gap-2">
                      {awaiting.candidates
                        .filter((c) => c !== awaiting.player)
                        .map((c) => targetButton(c, () => act("wolf_kill", c), "border-red-900 bg-red-950/50 text-red-200 hover:border-red-500"))}
                    </div>
                  )}
                  {awaiting.kind === "seer_check" && (
                    <div className="flex flex-wrap gap-2">
                      {awaiting.candidates.map((c) =>
                        targetButton(c, () => act("seer_check", c), "border-sky-900 bg-sky-950/50 text-sky-200 hover:border-sky-500")
                      )}
                    </div>
                  )}
                  {(awaiting.kind === "vote" || awaiting.kind === "pk_vote") && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {awaiting.candidates.map((c) =>
                          targetButton(
                            c,
                            () => act(awaiting.kind, c),
                            "border-slate-600 bg-slate-800 text-slate-200 hover:border-amber-500"
                          )
                        )}
                      </div>
                      {awaiting.kind === "vote" && (
                        <button onClick={() => act("vote", null)} className="mt-2 text-xs text-slate-500 underline">
                          本轮弃票
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

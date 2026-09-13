"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PublicState } from "@/lib/game/publicState";
import type { HumanActionRequest } from "@/lib/game/types";
import { EventLog, PHASE_LABEL, PlayerStrip, WinnerBanner, isNight } from "@/components/gameView";

const ROLE_STYLE: Record<string, string> = {
  wolf: "bg-red-950/70 text-red-300 border-red-800",
  seer: "bg-sky-950/70 text-sky-300 border-sky-800",
  villager: "bg-emerald-950/70 text-emerald-300 border-emerald-800",
};
const ROLE_LABEL: Record<string, string> = { wolf: "🐺 你的身份：狼人", seer: "🔮 你的身份：预言家", villager: "👤 你的身份：村民" };

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [state, setState] = useState<PublicState | null>(null);
  const [awaiting, setAwaiting] = useState<HumanActionRequest | null>(null);
  const [streaming, setStreaming] = useState<{ player: number; text: string } | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const busy = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/games/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((s: PublicState) => setState(s))
      .catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.events.length, streaming?.text]);

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
          setStreaming((prev) =>
            prev && prev.player === msg.player ? { player: msg.player, text: prev.text + msg.text } : { player: msg.player, text: msg.text }
          );
        } else if (msg.type === "result") {
          setState(msg.state);
          setAwaiting(msg.awaiting);
          setStreaming(null);
        } else if (msg.type === "error") {
          setError(msg.message);
          setStreaming(null);
        }
      }
    }
  }, [id]);

  // 自动节拍循环：有空档且不需要人类输入时持续推进
  useEffect(() => {
    if (!state || state.gameOver || awaiting || streaming || busy.current) return;
    busy.current = true;
    step()
      .catch((e) => setError(String(e)))
      .finally(() => {
        busy.current = false;
        setState((s) => (s ? { ...s } : s)); // 触发下一轮 effect
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
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-slate-400">对局不存在或已过期。</p>
        <Link href="/" className="text-amber-400 hover:underline">
          返回首页
        </Link>
      </main>
    );
  }
  if (!state) {
    return <main className="min-h-screen flex items-center justify-center text-slate-500">加载中……</main>;
  }

  const names = Object.fromEntries(state.players.map((p) => [p.id, p.name]));
  const aliveIds = state.players.filter((p) => p.alive).map((p) => p.id);
  const myId = state.me?.id ?? null;

  return (
    <main className={`min-h-screen p-4 sm:p-6 max-w-3xl mx-auto ${isNight(state.phase) ? "bg-gradient-to-b from-indigo-950 to-slate-950" : ""}`}>
      {/* 顶栏 */}
      <div className="flex items-center justify-between mb-4">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-300">
          🌙 AI 狼人杀
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">第 {Math.max(1, state.day)} 天</span>
          <span className={`rounded-full px-3 py-1 text-xs ${isNight(state.phase) ? "bg-indigo-900 text-indigo-200" : "bg-amber-900/60 text-amber-200"}`}>
            {PHASE_LABEL[state.phase] ?? state.phase}
          </span>
        </div>
      </div>

      {/* 我的身份 */}
      {state.me && !state.gameOver && (
        <div className="mb-4">
          <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${ROLE_STYLE[state.me.role]}`}>
            {ROLE_LABEL[state.me.role]}
            {state.me.role === "wolf" && state.me.teammates.length > 0 && (
              <span className="text-xs opacity-80">｜队友：{state.me.teammates.map((t) => `${t}号${names[t]}`).join("、")}</span>
            )}
          </div>
          {state.me.role === "seer" && state.me.seerKnowledge.length > 0 && (
            <div className="mt-2 text-xs text-sky-300/80">
              查验记录：
              {state.me.seerKnowledge.map((k) => `${k.target}号=${k.result === "wolf" ? "狼人" : "好人"}`).join("，")}
            </div>
          )}
          {state.me.wolfSuggestion && !awaiting && (
            <div className="mt-2 text-xs text-red-300/80">🐺 队友建议：{state.me.wolfSuggestion}</div>
          )}
        </div>
      )}

      <PlayerStrip state={state} meId={myId} />

      {/* 事件流 */}
      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 sm:p-4 min-h-[300px] max-h-[50vh] overflow-y-auto">
        <EventLog events={state.events} names={names} streaming={streaming} />
        {state.gameOver && <div ref={bottomRef} />}
        <div ref={state.gameOver ? undefined : bottomRef} />
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mt-3 rounded-xl border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>
            知道了
          </button>
        </div>
      )}

      {/* 行动面板 */}
      <div className="mt-4 min-h-[120px]">
        {state.gameOver ? (
          <div className="space-y-3">
            <WinnerBanner state={state} />
            <div className="flex gap-2 justify-center">
              <Link href={`/replay/${state.id}`} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500">
                回看本局
              </Link>
              <button
                onClick={() => fetch("/api/games", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
                  .then((r) => r.json())
                  .then((d) => (window.location.href = `/game/${d.id}`))}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950"
              >
                再来一局
              </button>
            </div>
          </div>
        ) : !awaiting ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
            <span className="h-2 w-2 animate-ping rounded-full bg-slate-500" />
            {streaming ? `${streaming.player}号正在发言……` : "AI 们正在行动……"}
          </div>
        ) : !state.me?.alive && awaiting.kind !== "last_words" ? (
          <div className="py-6 text-center text-sm text-slate-500">你已出局，观战中。</div>
        ) : (
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 space-y-3">
            {awaiting.kind === "speech" && (
              <>
                <div className="text-sm text-slate-300">轮到你发言了（≤120字）</div>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  maxLength={120}
                  rows={2}
                  placeholder="说点什么来证明自己的清白，或者带带节奏……"
                  className="w-full rounded-xl bg-slate-800 p-3 text-sm outline-none focus:ring-1 ring-amber-500"
                />
                <div className="flex gap-2">
                  <button
                    disabled={!input.trim()}
                    onClick={() => act("speech", null, input)}
                    className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
                  >
                    发言
                  </button>
                  <button onClick={() => act("speech", null, "过")} className="rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-300">
                    过
                  </button>
                </div>
              </>
            )}
            {awaiting.kind === "last_words" && (
              <>
                <div className="text-sm text-rose-300">你出局了——说出你的遗言（≤120字）</div>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  maxLength={120}
                  rows={2}
                  placeholder="留下最关键的情报……"
                  className="w-full rounded-xl bg-slate-800 p-3 text-sm outline-none focus:ring-1 ring-amber-500"
                />
                <button
                  disabled={!input.trim()}
                  onClick={() => act("last_words", null, input)}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  留下遗言
                </button>
              </>
            )}
            {awaiting.kind === "wolf_kill" && (
              <>
                <div className="text-sm text-red-300">🐺 天黑了。选择今晚的刀口：</div>
                <div className="flex flex-wrap gap-2">
                  {awaiting.candidates
                    .filter((c) => c !== awaiting.player)
                    .map((c) => (
                      <button key={c} onClick={() => act("wolf_kill", c)} className="rounded-xl border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200 hover:border-red-500">
                        {c}号（{names[c]}）
                      </button>
                    ))}
                </div>
              </>
            )}
            {awaiting.kind === "seer_check" && (
              <>
                <div className="text-sm text-sky-300">🔮 选择今晚查验的对象：</div>
                <div className="flex flex-wrap gap-2">
                  {awaiting.candidates.map((c) => (
                    <button key={c} onClick={() => act("seer_check", c)} className="rounded-xl border border-sky-900 bg-sky-950/50 px-3 py-2 text-sm text-sky-200 hover:border-sky-500">
                      {c}号（{names[c]}）
                    </button>
                  ))}
                </div>
              </>
            )}
            {(awaiting.kind === "vote" || awaiting.kind === "pk_vote") && (
              <>
                <div className="text-sm text-slate-300">
                  {awaiting.kind === "pk_vote" ? "⚖️ PK 投票——把票投给平票候选之一：" : "🗳️ 你最怀疑谁？投出你的一票："}
                </div>
                <div className="flex flex-wrap gap-2">
                  {awaiting.candidates.map((c) => (
                    <button key={c} onClick={() => act(awaiting.kind, c)} className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:border-amber-500">
                      {c}号（{names[c]}）
                    </button>
                  ))}
                </div>
                {awaiting.kind === "vote" && (
                  <button onClick={() => act("vote", null)} className="text-xs text-slate-500 underline">
                    弃票
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <footer className="mt-6 text-center text-[11px] text-slate-600">
        存活：{aliveIds.join("、")}号 ｜ {state.gameOver ? "对局已结束" : "节拍由服务端逐步推进，发言为模型实时流式生成"}
      </footer>
    </main>
  );
}

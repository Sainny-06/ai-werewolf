// 游戏运行时：把引擎（规则）和 AI 玩家（agents）连起来的节拍驱动器。
// 一次 runBeat 只推进一个节拍（一句发言 / 一次投票 / 一个夜晚行动 / 一次阶段流转），
// 适配 serverless 的超时限制，也让回放天然等于节拍序列。

import { db } from "@/lib/db";
import { getDriver } from "@/lib/agents";
import { buildView } from "@/lib/agents/context";
import { AgentFallback } from "@/lib/agents";
import * as engine from "./engine";
import type {
  BeatResult,
  GameEvent,
  GameState,
  HumanActionRequest,
  VoteRecord,
} from "./types";
import { PERSONAS } from "@/lib/agents/personas";

// ---------- 存储与缓存 ----------

const globalStore = globalThis as unknown as {
  wolfGames?: Map<string, GameState>;
  wolfLocks?: Map<string, Promise<unknown>>;
};
const games = (globalStore.wolfGames ??= new Map());
const locks = (globalStore.wolfLocks ??= new Map());

export async function createRuntimeGame(opts: {
  humanName?: string;
  gameId?: string;
  seed?: number;
  aiPlayers?: { name: string; persona: string }[];
}): Promise<GameState> {
  const id = opts.gameId ?? `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const state = engine.createGame({
    id,
    seed: opts.seed,
    aiPlayers: opts.aiPlayers ?? PERSONAS,
    humanName: opts.humanName,
  });
  games.set(id, state);
  await persist(state);
  return state;
}

export async function loadGame(id: string): Promise<GameState | null> {
  const cached = games.get(id);
  if (cached) return cached;
  const row = await db.game.findUnique({ where: { id } });
  if (!row) return null;
  const state = JSON.parse(row.stateJson) as GameState;
  games.set(id, state);
  return state;
}

async function persist(state: GameState): Promise<void> {
  try {
    await db.game.upsert({
      where: { id: state.id },
      create: { id: state.id, seed: state.seed, stateJson: JSON.stringify(state), winner: state.winner },
      update: { stateJson: JSON.stringify(state), winner: state.winner },
    });
  } catch (err) {
    console.error("[runtime] 持久化失败", err);
  }
}

/** 同一局游戏的节拍串行化，防止并发 step 打乱状态 */
export function withLock<T>(gameId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(gameId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(gameId, next.catch(() => {}));
  return next;
}

// ---------- 工具 ----------

function newEvents(state: GameState, before: number): GameEvent[] {
  return state.events.slice(before);
}

function isHumanAlive(state: GameState): boolean {
  const human = state.players.find((p) => p.isHuman);
  return Boolean(human && human.alive);
}

function randomFallbackVote(candidates: number[], exclude: number): VoteRecord {
  const pool = candidates.filter((c) => c !== exclude);
  const target = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
  return { voter: exclude, target, reason: "（网络波动，随机投票）", fallback: true };
}

async function driverVote(
  state: GameState,
  playerId: number,
  candidates: number[],
  isPk: boolean
): Promise<VoteRecord> {
  const driver = getDriver();
  const view = buildView(state, playerId);
  try {
    const r = await driver.vote(view, candidates.filter((c) => c !== playerId));
    return { voter: playerId, target: r.target, reason: r.reason };
  } catch (err) {
    if (!(err instanceof AgentFallback)) throw err;
    // 兜底：AI 投票失败 → 规则引擎侧随机，标记 fallback（游戏永不卡死）
    return randomFallbackVote(isPk ? candidates : candidates, playerId);
  }
}

// ---------- 节拍推进 ----------

export async function runBeat(
  state: GameState,
  onDelta?: (player: number, text: string) => void
): Promise<BeatResult> {
  const before = state.events.length;
  const driver = getDriver();
  let awaiting: HumanActionRequest | null = null;

  const human = state.players.find((p) => p.isHuman) ?? null;
  const aliveWolves = state.players.filter((p) => p.role === "wolf" && p.alive);
  const aliveIds = state.players.filter((p) => p.alive).map((p) => p.id);

  switch (state.phase) {
    case "setup": {
      engine.beginNight(state);
      break;
    }

    case "night_wolf": {
      if (human && human.role === "wolf" && human.alive) {
        // 人类是狼：先让 AI 队友给一条建议（每夜一次），再等人选刀口
        if (state.wolfSuggestion === null && aliveWolves.some((w) => !w.isHuman)) {
          const aiWolf = aliveWolves.find((w) => !w.isHuman)!;
          state.wolfSuggestion = await driver.wolfSuggestion(buildView(state, aiWolf.id));
        } else {
          awaiting = { kind: "wolf_kill", player: human.id, day: state.day, candidates: aliveIds };
        }
      } else {
        const aiWolf = aliveWolves.find((w) => !w.isHuman);
        if (!aiWolf) throw new Error("没有存活狼人，阶段异常");
        const candidates = aliveIds.filter((id) => state.players.find((p) => p.id === id)!.role !== "wolf");
        try {
          const r = await driver.wolfKill(buildView(state, aiWolf.id), candidates);
          engine.setWolfKill(state, r.target, r.suggestion);
        } catch (err) {
          if (!(err instanceof AgentFallback)) throw err;
          engine.setWolfKill(state, candidates[Math.floor(Math.random() * candidates.length)]);
        }
      }
      break;
    }

    case "night_seer": {
      const seer = state.players.find((p) => p.role === "seer")!;
      if (!seer.alive) {
        engine.skipSeerCheck(state);
      } else if (seer.isHuman) {
        awaiting = { kind: "seer_check", player: seer.id, day: state.day, candidates: aliveIds.filter((id) => id !== seer.id) };
      } else {
        const candidates = aliveIds.filter((id) => id !== seer.id);
        try {
          const r = await driver.seerCheck(buildView(state, seer.id), candidates);
          engine.setSeerCheck(state, r.target);
        } catch (err) {
          if (!(err instanceof AgentFallback)) throw err;
          engine.setSeerCheck(state, candidates[Math.floor(Math.random() * candidates.length)]);
        }
      }
      break;
    }

    case "dawn": {
      if (state.lastWordsPending.length > 0) {
        const pid = state.lastWordsPending[0];
        const player = state.players.find((p) => p.id === pid)!;
        if (player.isHuman) {
          awaiting = { kind: "last_words", player: pid, day: state.day, candidates: [] };
        } else {
          const exiled = !state.deathsTonight.includes(pid);
          try {
            const content = await driver.lastWords(
              buildView(state, pid),
              { exiled },
              (t) => onDelta?.(pid, t)
            );
            engine.recordLastWords(state, pid, content);
          } catch (err) {
            if (!(err instanceof AgentFallback)) throw err;
            engine.recordLastWords(state, pid, "……（信号不好，他没能说完。）");
          }
        }
        break;
      }
      if (engine.checkWin(state)) break;
      if (engine.afterLastWords(state) === "speech") {
        engine.beginSpeeches(state);
      } else {
        engine.beginNight(state);
      }
      break;
    }

    case "speech":
    case "pk_speech": {
      const pid = engine.currentSpeaker(state);
      const speaker = state.players.find((p) => p.id === pid)!;
      if (speaker.isHuman) {
        awaiting = { kind: "speech", player: pid, day: state.day, candidates: [] };
      } else {
        const view = buildView(state, pid);
        let content: string;
        try {
          content = await driver.speech(view, (t) => onDelta?.(pid, t));
        } catch (err) {
          if (!(err instanceof AgentFallback)) throw err;
          content = `${pid}号沉默了一会儿，只说了句：「过。」`;
        }
        engine.recordSpeech(state, pid, content.slice(0, 120));
      }
      break;
    }

    case "vote":
    case "pk_vote": {
      const isPk = state.phase === "pk_vote";
      const candidates = isPk ? state.pkCandidates : aliveIds;
      const aiAlive = state.players.filter((p) => p.alive && !p.isHuman).map((p) => p.id);
      const missing = aiAlive.filter((pid) => !state.votes.some((v) => v.voter === pid));
      if (missing.length > 0) {
        // AI 投票并行生成（一个节拍内完成），增量补充，不覆盖人类已投的票
        const draft = await Promise.all(
          missing.map((pid) => driverVote(state, pid, candidates, isPk))
        );
        state.votes.push(...draft);
        await persist(state);
      }
      if (isHumanAlive(state)) {
        const humanVoted = state.votes.some((v) => v.voter === human!.id);
        if (!humanVoted) {
          awaiting = {
            kind: isPk ? "pk_vote" : "vote",
            player: human!.id,
            day: state.day,
            candidates: isPk ? candidates : candidates.filter((c) => c !== human!.id),
          };
          break;
        }
        // 人类已投：结算由 action 接口触发（见 submitHumanVote），step 不重复结算
        break;
      }
      if (state.votes.length >= aliveIds.length) {
        engine.submitVotes(state, state.votes);
      }
      break;
    }

    case "game_over":
      break;
  }

  await persist(state);
  return {
    events: newEvents(state, before),
    awaiting,
    done: state.phase === "game_over",
    phase: state.phase,
  };
}

// ---------- 人类操作入口 ----------

/** 提交人类操作并推进结算。返回新增事件与最新等待项。 */
export async function submitHumanAction(
  state: GameState,
  action: { kind: HumanActionRequest["kind"]; target?: number | null; content?: string }
): Promise<BeatResult> {
  const before = state.events.length;
  const human = state.players.find((p) => p.isHuman)!;
  const aliveIds = state.players.filter((p) => p.alive).map((p) => p.id);

  switch (action.kind) {
    case "wolf_kill":
      if (state.pendingWolfTarget !== null) throw new Error("今晚已经刀过了");
      engine.setWolfKill(state, action.target!);
      break;
    case "seer_check":
      engine.setSeerCheck(state, action.target!);
      break;
    case "last_words":
      engine.recordLastWords(state, human.id, action.content ?? "");
      break;
    case "speech":
      engine.recordSpeech(state, human.id, action.content ?? "");
      break;
    case "vote":
    case "pk_vote": {
      if (!state.votes.some((v) => v.voter === human.id)) {
        state.votes.push({ voter: human.id, target: action.target ?? null });
      }
      const aliveCount = aliveIds.length;
      if (state.votes.length >= aliveCount) {
        engine.submitVotes(state, state.votes);
      }
      break;
    }
  }

  await persist(state);
  return {
    events: newEvents(state, before),
    awaiting: null,
    done: state.phase === "game_over",
    phase: state.phase,
  };
}

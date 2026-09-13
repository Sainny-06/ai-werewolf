// 规则引擎：狼人杀全部确定性逻辑。纯函数、可完全单测，禁止在此文件引入 LLM 相关代码。
// 规则依据：docs/RULES.md

import {
  GameError,
  type Camp,
  type GameEvent,
  type GameState,
  type Player,
  type Role,
  type VoteRecord,
} from "./types";
import { mulberry32, shuffle } from "./rng";

export const PLAYER_COUNT = 7;
const ROLE_DECK: Role[] = ["wolf", "wolf", "seer", "villager", "villager", "villager", "villager"];

export interface CreateGameOptions {
  id: string;
  seed?: number;
  /** 6 个 AI 玩家的名字与人设，顺序即牌堆外顺序（内部再随机分配身份） */
  aiPlayers: { name: string; persona: string }[];
  /** 人类玩家名字；不传则纯 AI 局 */
  humanName?: string;
  /** 指定人类座位号（1–7），测试用；不传则随机 */
  humanId?: number;
}

export function createGame(opts: CreateGameOptions): GameState {
  if (opts.aiPlayers.length !== PLAYER_COUNT - (opts.humanName ? 1 : 0)) {
    throw new GameError("AI 玩家数量必须为 6（有人类）或 7（纯 AI 局）");
  }
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rand = mulberry32(seed);
  const roles = shuffle([...ROLE_DECK], rand);

  const humanSeat = opts.humanName
    ? opts.humanId ?? Math.floor(rand() * PLAYER_COUNT) + 1
    : 0;

  const aiQueue = [...opts.aiPlayers];
  const players: Player[] = [];
  for (let id = 1; id <= PLAYER_COUNT; id++) {
    if (opts.humanName && id === humanSeat) {
      players.push({ id, name: opts.humanName, persona: "", role: roles[id - 1], alive: true, isHuman: true });
    } else {
      const ai = aiQueue.shift()!;
      players.push({ id, name: ai.name, persona: ai.persona, role: roles[id - 1], alive: true, isHuman: false });
    }
  }

  const state: GameState = {
    id: opts.id,
    seed,
    day: 0,
    phase: "setup",
    players,
    seerKnowledge: {},
    pendingWolfTarget: null,
    wolfSuggestion: null,
    deathsTonight: [],
    lastWordsPending: [],
    speechOrder: [],
    speechIndex: 0,
    speeches: [],
    votes: [],
    pkCandidates: [],
    nextAfterLastWords: "speech",
    winner: null,
    events: [],
  };
  pushEvent(state, {
    type: "game_start",
    players: players.map((p) => ({ id: p.id, name: p.name, persona: p.persona })),
  });
  return state;
}

// ---------- 内部工具 ----------

function pushEvent(state: GameState, event: GameEvent) {
  state.events.push(event);
}

function requirePhase(state: GameState, ...phases: GameState["phase"][]) {
  if (!phases.includes(state.phase)) {
    throw new GameError(`当前阶段为 ${state.phase}，不允许该操作（期望 ${phases.join("/")})`);
  }
}

function alivePlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.alive);
}

function getPlayer(state: GameState, id: number): Player {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new GameError(`玩家 ${id} 不存在`);
  return p;
}

function wolves(state: GameState): Player[] {
  return state.players.filter((p) => p.role === "wolf");
}

function seer(state: GameState): Player | undefined {
  return state.players.find((p) => p.role === "seer");
}

/** 从 start 座位的下一位开始，按座位递增循环收集存活玩家 */
function aliveFrom(state: GameState, start: number): number[] {
  const alive = alivePlayers(state).map((p) => p.id);
  const ordered: number[] = [];
  for (let i = 1; i <= PLAYER_COUNT; i++) {
    const seat = ((start - 1 + i) % PLAYER_COUNT) + 1;
    if (alive.includes(seat)) ordered.push(seat);
  }
  return ordered;
}

// ---------- 阶段推进 ----------

/** 进入夜晚（day +1）。允许从 setup（开局）或 dawn（白天结束）进入。 */
export function beginNight(state: GameState): GameState {
  requirePhase(state, "setup", "dawn");
  if (state.lastWordsPending.length > 0) {
    throw new GameError("还有未发表的遗言，不能进入夜晚");
  }
  state.day += 1;
  state.phase = "night_wolf";
  state.pendingWolfTarget = null;
  state.wolfSuggestion = null;
  state.deathsTonight = [];
  state.speechOrder = [];
  state.speechIndex = 0;
  state.speeches = [];
  state.votes = [];
  state.pkCandidates = [];
  pushEvent(state, { type: "night_start", day: state.day });
  return state;
}

/** 狼人选择击杀目标。 */
export function setWolfKill(state: GameState, target: number, suggestion?: string): GameState {
  requirePhase(state, "night_wolf");
  const t = getPlayer(state, target);
  if (!t.alive) throw new GameError(`击杀目标 ${target} 已出局`);
  state.pendingWolfTarget = target;
  state.wolfSuggestion = suggestion ?? null;
  pushEvent(state, {
    type: "wolf_kill",
    day: state.day,
    actors: wolves(state).filter((p) => p.alive).map((p) => p.id),
    target,
    suggestion,
  });
  state.phase = "night_seer";
  return state;
}

/** 预言家查验。 */
export function setSeerCheck(state: GameState, target: number): GameState {
  requirePhase(state, "night_seer");
  const s = seer(state);
  if (!s || !s.alive) throw new GameError("预言家已出局，应跳过查验");
  const t = getPlayer(state, target);
  if (!t.alive) throw new GameError(`查验目标 ${target} 已出局`);
  if (target === s.id) throw new GameError("不能查验自己");
  state.seerKnowledge[target] = t.role === "wolf" ? "wolf" : "good";
  pushEvent(state, {
    type: "seer_check",
    day: state.day,
    actor: s.id,
    target,
    result: state.seerKnowledge[target],
  });
  return resolveDawn(state);
}

/** 预言家已出局时跳过查验，直接结算天亮。 */
export function skipSeerCheck(state: GameState): GameState {
  requirePhase(state, "night_seer");
  const s = seer(state);
  if (s && s.alive) throw new GameError("预言家存活时不能跳过查验");
  return resolveDawn(state);
}

/** 夜晚结算：狼刀生效、公布死者、准备白天发言。由查验/跳过查验内部调用。 */
function resolveDawn(state: GameState): GameState {
  if (state.pendingWolfTarget === null) {
    throw new GameError("狼刀目标缺失，不能结算天亮");
  }
  const deaths: number[] = [];
  const victim = getPlayer(state, state.pendingWolfTarget);
  if (victim.alive) {
    victim.alive = false;
    deaths.push(victim.id);
  }
  state.pendingWolfTarget = null;
  state.deathsTonight = deaths;
  state.lastWordsPending = state.day === 1 ? [...deaths] : [];
  state.nextAfterLastWords = "speech";
  const firstDeath = deaths.length > 0 ? Math.min(...deaths) : 0;
  state.speechOrder = deaths.length > 0 ? aliveFrom(state, firstDeath) : aliveFrom(state, 0);
  state.speechIndex = 0;
  state.speeches = [];
  state.phase = "dawn";
  pushEvent(state, { type: "dawn", day: state.day, deaths });
  return state;
}

/** 发表一条遗言（首夜被刀者或被放逐者）。 */
export function recordLastWords(state: GameState, playerId: number, content: string): GameState {
  requirePhase(state, "dawn");
  if (!state.lastWordsPending.includes(playerId)) {
    throw new GameError(`玩家 ${playerId} 当前没有遗言资格`);
  }
  const text = content.trim();
  if (!text || text.length > 120) throw new GameError("遗言需为 1–120 字");
  state.lastWordsPending = state.lastWordsPending.filter((id) => id !== playerId);
  pushEvent(state, { type: "last_words", day: state.day, player: playerId, content: text });
  return state;
}

/** 遗言清空后：开始白天发言，或进入下一夜（被放逐后）。 */
export function afterLastWords(state: GameState): "speech" | "night" {
  requirePhase(state, "dawn");
  if (state.lastWordsPending.length > 0) throw new GameError("遗言尚未发表完毕");
  return state.nextAfterLastWords;
}

/** 开始白天发言（dawn 阶段遗言处理完后调用）。 */
export function beginSpeeches(state: GameState): GameState {
  requirePhase(state, "dawn");
  if (state.lastWordsPending.length > 0) throw new GameError("还有遗言未发表");
  if (state.nextAfterLastWords !== "speech") throw new GameError("本轮无需白天发言");
  state.phase = "speech";
  return state;
}

/** 记录一条白天发言或 PK 发言。 */
export function recordSpeech(state: GameState, playerId: number, content: string): GameState {
  requirePhase(state, "speech", "pk_speech");
  const expected = state.speechOrder[state.speechIndex];
  if (playerId !== expected) {
    throw new GameError(`轮到玩家 ${expected} 发言，不是 ${playerId}`);
  }
  const text = content.trim();
  if (!text || text.length > 120) throw new GameError("发言需为 1–120 字");
  state.speeches.push({ player: playerId, content: text });
  state.speechIndex += 1;
  pushEvent(state, { type: "speech", day: state.day, player: playerId, content: text });
  if (state.speechIndex >= state.speechOrder.length) {
    state.phase = state.phase === "pk_speech" ? "pk_vote" : "vote";
    state.votes = [];
  }
  return state;
}

/**
 * 提交全部投票并结算（vote 或 pk_vote）。
 * - pk_vote 中目标必须是 PK 候选，越界按弃票兜底并标记 fallback
 * - 唯一最高票 → 放逐；平票（vote）→ PK 流程；平票（pk_vote）或全员弃票 → 无人出局
 */
export function submitVotes(state: GameState, votes: VoteRecord[]): GameState {
  requirePhase(state, "vote", "pk_vote");
  const isPk = state.phase === "pk_vote";
  const aliveIds = alivePlayers(state).map((p) => p.id);

  const seen = new Set<number>();
  const normalized: VoteRecord[] = votes.map((v) => {
    if (!seen.has(v.voter)) seen.add(v.voter);
    else throw new GameError(`玩家 ${v.voter} 重复投票`);
    let target = v.target;
    let fallback = false;
    if (target !== null && !aliveIds.includes(target)) {
      target = null;
      fallback = true;
    }
    if (isPk && target !== null && !state.pkCandidates.includes(target)) {
      target = null;
      fallback = true;
    }
    return { voter: v.voter, target, reason: v.reason, fallback: fallback || v.fallback };
  });
  if (seen.size !== aliveIds.length) {
    throw new GameError(`投票不完整：期望 ${aliveIds.length} 票，收到 ${seen.size} 票`);
  }

  const counts = new Map<number, number>();
  for (const v of normalized) {
    if (v.target !== null) counts.set(v.target, (counts.get(v.target) ?? 0) + 1);
  }
  const max = Math.max(0, ...counts.values());
  const top = [...counts.entries()].filter(([, n]) => n === max).map(([id]) => id);

  state.votes = normalized;

  if (max === 0 || top.length !== 1) {
    // 平票或全员弃票
    if (!isPk && top.length > 1) {
      state.pkCandidates = [...top].sort((a, b) => a - b);
      state.speechOrder = state.pkCandidates;
      state.speechIndex = 0;
      state.speeches = [];
      state.phase = "pk_speech";
      pushEvent(state, { type: "vote_result", day: state.day, votes: normalized, exiled: null, isPk: false });
      return state;
    }
    // pk_vote 再平票，或全员弃票：无人出局
    state.pkCandidates = [];
    state.lastWordsPending = [];
    state.nextAfterLastWords = "night";
    state.phase = "dawn";
    pushEvent(state, { type: "vote_result", day: state.day, votes: normalized, exiled: null, isPk });
    return state;
  }

  const exiled = top[0];
  const p = getPlayer(state, exiled);
  p.alive = false;
  state.pkCandidates = [];
  state.lastWordsPending = [exiled];
  state.nextAfterLastWords = "night";
  state.phase = "dawn";
  pushEvent(state, { type: "vote_result", day: state.day, votes: normalized, exiled, isPk });
  pushEvent(state, { type: "exile", day: state.day, player: exiled });
  return state;
}

/**
 * 胜负判定（每次出局后调用）。
 * 狼全灭 → 好人胜；狼数 ≥ 好人数 → 狼胜。返回是否分出胜负。
 */
export function checkWin(state: GameState): boolean {
  if (state.phase === "game_over") return true;
  const wolvesAlive = alivePlayers(state).filter((p) => p.role === "wolf").length;
  const goodAlive = alivePlayers(state).length - wolvesAlive;
  let winner: Camp | null = null;
  if (wolvesAlive === 0) winner = "good";
  else if (wolvesAlive >= goodAlive) winner = "wolf";
  if (!winner) return false;
  state.winner = winner;
  state.phase = "game_over";
  pushEvent(state, {
    type: "game_over",
    winner,
    players: state.players.map((p) => ({ id: p.id, role: p.role, alive: p.alive })),
  });
  return true;
}

// ---------- 查询 ----------

export function currentSpeaker(state: GameState): number {
  return state.speechOrder[state.speechIndex];
}

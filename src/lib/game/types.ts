// 游戏领域类型。术语与 docs/RULES.md 第 10 节一致。

export type Role = "wolf" | "seer" | "villager";

export type Phase =
  | "setup"
  | "night_wolf"
  | "night_seer"
  | "dawn"
  | "speech"
  | "vote"
  | "pk_speech"
  | "pk_vote"
  | "game_over";

export interface Player {
  /** 座位号即玩家 id，1–7 */
  id: number;
  name: string;
  /** AI 人设描述，人类玩家为空串 */
  persona: string;
  role: Role;
  alive: boolean;
  isHuman: boolean;
}

export interface VoteRecord {
  voter: number;
  /** null = 弃票 */
  target: number | null;
  reason?: string;
  /** true = 原始目标不合法，被规则引擎兜底成弃票 */
  fallback?: boolean;
}

// ---------- 回放事件（docs/RULES.md 第 9 节） ----------

export type CheckResult = "wolf" | "good";
export type Camp = "wolf" | "good";

export type GameEvent =
  | { type: "game_start"; players: { id: number; name: string; persona: string }[] }
  | { type: "night_start"; day: number }
  | { type: "wolf_kill"; day: number; actors: number[]; target: number; suggestion?: string }
  | { type: "seer_check"; day: number; actor: number; target: number; result: CheckResult }
  | { type: "dawn"; day: number; deaths: number[] }
  | { type: "last_words"; day: number; player: number; content: string }
  | { type: "speech"; day: number; player: number; content: string }
  | { type: "vote_result"; day: number; votes: VoteRecord[]; exiled: number | null; isPk: boolean }
  | { type: "exile"; day: number; player: number }
  | { type: "game_over"; winner: Camp; players: { id: number; role: Role; alive: boolean }[] };

// ---------- 游戏状态（可序列化，权威数据） ----------

export interface GameState {
  id: string;
  seed: number;
  /** 当前是第几夜/天，从 1 开始 */
  day: number;
  phase: Phase;
  players: Player[];
  /** 预言家的私有查验记录：targetId -> 结果（上下文构建时只暴露给预言家） */
  seerKnowledge: Record<number, CheckResult>;
  /** 本夜待处理的狼刀目标（狼行动后写入，天亮结算） */
  pendingWolfTarget: number | null;
  /** 狼刀时 AI 队友给出的建议（人类是狼时展示） */
  wolfSuggestion: string | null;
  /** 天亮待公布的死亡名单 */
  deathsTonight: number[];
  /** 待发表遗言的玩家 id 队列 */
  lastWordsPending: number[];
  /** 本轮发言的玩家 id 顺序（存活者） */
  speechOrder: number[];
  /** speechOrder 中下一个发言的下标 */
  speechIndex: number;
  /** 本轮已发生的发言（白天发言或 PK 发言） */
  speeches: { player: number; content: string }[];
  /** 本轮投票记录（vote 或 pk_vote 共用，resolve 后清空） */
  votes: VoteRecord[];
  /** PK 候选（平票者） */
  pkCandidates: number[];
  /** 遗言清空后该去哪：'speech' = 天亮后的白天发言；'night' = 放逐/流局后的下一夜 */
  nextAfterLastWords: "speech" | "night";
  winner: Camp | null;
  /** 全部事件，按发生顺序 */
  events: GameEvent[];
}

/** 引擎抛出的非法操作错误（正常流程不应出现；出现即说明调用方校验缺失） */
export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameError";
  }
}

export interface HumanActionRequest {
  kind: "speech" | "vote" | "pk_vote" | "wolf_kill" | "seer_check" | "last_words";
  player: number;
  day: number;
  /** 投票时的候选范围；空数组表示全部存活玩家 */
  candidates: number[];
}

/** 一次 runBeat 的结果 */
export interface BeatResult {
  /** 本次推进新增的事件 */
  events: GameEvent[];
  /** 等待人类输入时给出 */
  awaiting: HumanActionRequest | null;
  /** 游戏是否结束 */
  done: boolean;
  phase: Phase;
}

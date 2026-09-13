// 上下文构建：信息隔离的唯一出口（AGENTS.md 架构规则 2）。
// 任何发给 LLM 的内容都必须经过 buildView —— 私有信息只进对应玩家的视角。

import type { GameEvent, GameState } from "@/lib/game/types";

export interface AgentView {
  gameId: string;
  playerId: number;
  name: string;
  persona: string;
  role: "wolf" | "seer" | "villager";
  /** 仅狼人可见：队友座位号 */
  teammates: number[];
  /** 仅预言家可见：查验历史 */
  seerKnowledge: { target: number; result: "wolf" | "good" }[];
  aliveIds: number[];
  /** 所有玩家座位号→名字（公开信息：开局即知谁坐哪） */
  names: Record<number, string>;
  /** 按时间线组织的公开事件记录 */
  publicHistory: string;
  day: number;
  isPk: boolean;
  /** 本轮已发言内容（speech 阶段用） */
  speechesSoFar: { player: number; content: string }[];
}

export function buildView(state: GameState, playerId: number): AgentView {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) throw new Error(`玩家 ${playerId} 不存在`);

  const view: AgentView = {
    gameId: state.id,
    playerId: me.id,
    name: me.name,
    persona: me.persona,
    role: me.role,
    teammates: [],
    seerKnowledge: [],
    aliveIds: state.players.filter((p) => p.alive).map((p) => p.id),
    names: Object.fromEntries(state.players.map((p) => [p.id, p.name])),
    publicHistory: "",
    day: state.day,
    isPk: state.phase === "pk_speech" || state.phase === "pk_vote",
    speechesSoFar: [...state.speeches],
  };

  if (me.role === "wolf") {
    view.teammates = state.players.filter((p) => p.role === "wolf" && p.id !== me.id).map((p) => p.id);
  }
  if (me.role === "seer") {
    view.seerKnowledge = Object.entries(state.seerKnowledge).map(([t, r]) => ({
      target: Number(t),
      result: r,
    }));
  }

  view.publicHistory = formatPublicHistory(state);
  return view;
}

function seatLabel(id: number, names: Record<number, string>): string {
  return `${id}号（${names[id]}）`;
}

function formatPublicHistory(state: GameState): string {
  const names = Object.fromEntries(state.players.map((p) => [p.id, p.name]));
  const lines: string[] = [];
  for (const e of state.events) {
    switch (e.type) {
      case "game_start":
        lines.push(
          "座次：" + e.players.map((p) => `${p.id}号=${p.name}`).join("，")
        );
        break;
      case "night_start":
        lines.push(`【第 ${e.day} 夜】天黑请闭眼。`);
        break;
      case "dawn":
        lines.push(
          e.deaths.length > 0
            ? `【第 ${e.day} 天】天亮：昨晚 ${e.deaths.map((d) => `${d}号`).join("、")} 出局。`
            : `【第 ${e.day} 天】天亮：平安夜，无人出局。`
        );
        break;
      case "last_words":
        lines.push(`${seatLabel(e.player, names)}遗言：${e.content}`);
        break;
      case "speech":
        lines.push(`${e.player}号：${e.content}`);
        break;
      case "vote_result":
        lines.push(
          `第 ${e.day} 天投票：` +
            e.votes
              .map((v) => `${v.voter}号→${v.target === null ? "弃票" : `${v.target}号`}${v.reason ? `（${v.reason}）` : ""}`)
              .join("；") +
            (e.exiled === null ? "。结果：无人出局。" : `。结果：${e.exiled}号被放逐。`)
        );
        break;
      case "exile":
        lines.push(`${e.player}号被放逐出局。`);
        break;
      // wolf_kill / seer_check 是夜间私有信息，不出现在任何公开视角
      case "wolf_kill":
      case "seer_check":
      case "game_over":
        break;
    }
  }
  return lines.join("\n") || "（对局刚开始，还没有公开信息。）";
}

export type { GameEvent };

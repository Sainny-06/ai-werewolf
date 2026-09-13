// 发给前端的公开状态投影：严格隐藏夜间私有信息（AGENTS.md 信息隔离），
// 玩家自己的角色/查验/队友单独下发，身份在终局才全体揭示。

import type { GameEvent, GameState } from "@/lib/game/types";

export interface PublicPlayer {
  id: number;
  name: string;
  persona: string;
  alive: boolean;
  isHuman: boolean;
  role?: string;
}

export interface PublicState {
  id: string;
  day: number;
  phase: string;
  winner: "wolf" | "good" | null;
  gameOver: boolean;
  players: PublicPlayer[];
  events: GameEvent[];
  me: {
    id: number;
    role: string;
    alive: boolean;
    teammates: number[];
    seerKnowledge: { target: number; result: "wolf" | "good" }[];
    wolfSuggestion: string | null;
  } | null;
}

export function toPublicState(state: GameState): PublicState {
  const human = state.players.find((p) => p.isHuman) ?? null;
  const gameOver = state.phase === "game_over";
  return {
    id: state.id,
    day: state.day,
    phase: state.phase,
    winner: state.winner,
    gameOver,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      persona: p.persona,
      alive: p.alive,
      isHuman: p.isHuman,
      ...(gameOver ? { role: p.role } : {}),
    })),
    events: state.events.filter((e) => {
      if (e.type === "wolf_kill" || e.type === "seer_check") return gameOver;
      return true;
    }),
    me:
      human && !gameOver
        ? {
            id: human.id,
            role: human.role,
            alive: human.alive,
            teammates:
              human.role === "wolf"
                ? state.players.filter((p) => p.role === "wolf" && p.id !== human.id).map((p) => p.id)
                : [],
            seerKnowledge:
              human.role === "seer"
                ? Object.entries(state.seerKnowledge).map(([t, r]) => ({ target: Number(t), result: r }))
                : [],
            wolfSuggestion: human.role === "wolf" ? state.wolfSuggestion : null,
          }
        : null,
  };
}

import { describe, expect, it } from "vitest";
import {
  afterLastWords,
  beginNight,
  beginSpeeches,
  checkWin,
  createGame,
  currentSpeaker,
  recordLastWords,
  recordSpeech,
  setSeerCheck,
  setWolfKill,
  skipSeerCheck,
  submitVotes,
} from "@/lib/game/engine";
import type { GameState, Role, VoteRecord } from "@/lib/game/types";

const AI6 = Array.from({ length: 6 }, (_, i) => ({
  name: `AI-${i + 1}`,
  persona: `测试人设 ${i + 1}`,
}));
const AI7 = Array.from({ length: 7 }, (_, i) => ({
  name: `AI-${i + 1}`,
  persona: `测试人设 ${i + 1}`,
}));

function byRole(state: GameState, role: Role) {
  return state.players.filter((p) => p.role === role);
}

function alive(state: GameState) {
  return state.players.filter((p) => p.alive).map((p) => p.id);
}

function roleOf(state: GameState, id: number) {
  return state.players.find((p) => p.id === id)!.role;
}

/** 全体存活玩家都投 target 的投票 */
function unanimous(state: GameState, target: number): VoteRecord[] {
  return alive(state).map((voter) => ({ voter, target }));
}

/** 夜晚的预言家行动：活着必须查，死了才跳过 */
function seerAction(state: GameState) {
  const seer = byRole(state, "seer")[0];
  if (seer.alive) {
    setSeerCheck(state, alive(state).find((id) => id !== seer.id)!);
  } else {
    skipSeerCheck(state);
  }
}

/** 造一局进行到天亮（刀了一名村民，已结算死亡） */
function intoDawn(seed: number) {
  const s = createGame({ id: "t", seed, aiPlayers: AI6, humanName: "你" });
  beginNight(s);
  const victim = byRole(s, "villager")[0];
  setWolfKill(s, victim.id);
  seerAction(s);
  return { s, victim };
}

/** 造一局进行到投票阶段（白天发言全部"过"） */
function intoVote(seed: number) {
  const { s } = intoDawn(seed);
  recordLastWords(s, s.lastWordsPending[0], "遗言");
  beginSpeeches(s);
  while (s.phase === "speech") recordSpeech(s, currentSpeaker(s), "过");
  return { s };
}

describe("createGame", () => {
  it("发牌符合 2 狼 1 预言家 4 村民", () => {
    const s = createGame({ id: "t", seed: 42, aiPlayers: AI6, humanName: "你" });
    expect(s.players).toHaveLength(7);
    expect(byRole(s, "wolf")).toHaveLength(2);
    expect(byRole(s, "seer")).toHaveLength(1);
    expect(byRole(s, "villager")).toHaveLength(4);
    expect(s.players.filter((p) => p.isHuman)).toHaveLength(1);
    expect(s.phase).toBe("setup");
    expect(s.events[0].type).toBe("game_start");
  });

  it("同 seed 发牌完全一致", () => {
    const a = createGame({ id: "a", seed: 7, aiPlayers: AI6, humanName: "你" });
    const b = createGame({ id: "b", seed: 7, aiPlayers: AI6, humanName: "你" });
    expect(a.players.map((p) => p.role)).toEqual(b.players.map((p) => p.role));
    expect(a.players.find((p) => p.isHuman)!.id).toBe(b.players.find((p) => p.isHuman)!.id);
  });

  it("humanId 指定人类座位", () => {
    const s = createGame({ id: "t", seed: 1, aiPlayers: AI6, humanName: "你", humanId: 3 });
    expect(s.players.find((p) => p.id === 3)!.isHuman).toBe(true);
  });

  it("纯 AI 局 7 个 AI", () => {
    const s = createGame({ id: "t", seed: 1, aiPlayers: AI7 });
    expect(s.players.filter((p) => p.isHuman)).toHaveLength(0);
  });
});

describe("夜晚流程", () => {
  it("beginNight 推进天数与阶段", () => {
    const s = createGame({ id: "t", seed: 1, aiPlayers: AI6, humanName: "你" });
    beginNight(s);
    expect(s.day).toBe(1);
    expect(s.phase).toBe("night_wolf");
    expect(s.events.at(-1)?.type).toBe("night_start");
  });

  it("狼刀合法目标后进入查验阶段", () => {
    const s = createGame({ id: "t", seed: 1, aiPlayers: AI6, humanName: "你" });
    beginNight(s);
    const good = s.players.find((p) => p.role !== "wolf")!;
    setWolfKill(s, good.id, "建议刀他");
    expect(s.phase).toBe("night_seer");
    expect(s.pendingWolfTarget).toBe(good.id);
    expect(s.events.at(-1)).toMatchObject({ type: "wolf_kill", target: good.id });
  });

  it("不能刀已出局玩家", () => {
    const s = createGame({ id: "t", seed: 1, aiPlayers: AI6, humanName: "你" });
    beginNight(s);
    s.players.find((p) => p.id === 1)!.alive = false;
    expect(() => setWolfKill(s, 1)).toThrow();
  });

  it("预言家查验：狼记 wolf、好人记 good，不能查自己", () => {
    const s = createGame({ id: "t", seed: 1, aiPlayers: AI6, humanName: "你" });
    beginNight(s);
    const seer = byRole(s, "seer")[0];
    const wolf = byRole(s, "wolf").find((w) => w.id !== seer.id)!;
    const villager = byRole(s, "villager")[0];
    setWolfKill(s, villager.id);
    setSeerCheck(s, wolf.id);
    // 查一名狼 → wolf（同时引擎进入天亮，需重新开局查好人）
    expect(s.seerKnowledge[wolf.id]).toBe("wolf");
    expect(s.phase).toBe("dawn");

    const s2 = createGame({ id: "t2", seed: 1, aiPlayers: AI6, humanName: "你" });
    beginNight(s2);
    const seer2 = byRole(s2, "seer")[0];
    const villager2 = byRole(s2, "villager").find((v) => v.id !== seer2.id)!;
    setWolfKill(s2, byRole(s2, "villager")[0].id);
    setSeerCheck(s2, villager2.id);
    expect(s2.seerKnowledge[villager2.id]).toBe("good");

    // 自查在 night_seer 阶段直接被拒（用第三局验证）
    const s3 = createGame({ id: "t3", seed: 1, aiPlayers: AI6, humanName: "你" });
    beginNight(s3);
    const seer3 = byRole(s3, "seer")[0];
    setWolfKill(s3, byRole(s3, "villager")[0].id);
    expect(() => setSeerCheck(s3, seer3.id)).toThrow();
  });

  it("预言家已出局时跳过查验", () => {
    const s = createGame({ id: "t", seed: 1, aiPlayers: AI6, humanName: "你" });
    beginNight(s);
    byRole(s, "seer")[0].alive = false;
    const good = s.players.find((p) => p.role === "villager")!;
    setWolfKill(s, good.id);
    skipSeerCheck(s);
    expect(s.phase).toBe("dawn");
    expect(s.deathsTonight).toEqual([good.id]);
  });
});

describe("天亮与发言", () => {
  it("天亮结算死亡，第 1 夜死者有遗言，发言顺序从死者下一位开始", () => {
    const { s, victim } = intoDawn(3);
    expect(s.deathsTonight).toEqual([victim.id]);
    expect(s.lastWordsPending).toEqual([victim.id]);
    expect(s.nextAfterLastWords).toBe("speech");
    const expectedOrder: number[] = [];
    for (let i = 1; i <= 7 && expectedOrder.length < 6; i++) {
      const seat = ((victim.id - 1 + i) % 7) + 1;
      if (alive(s).includes(seat)) expectedOrder.push(seat);
    }
    expect(s.speechOrder).toEqual(expectedOrder);
    expect(s.speechOrder).not.toContain(victim.id);
  });

  it("第 2 夜起被刀者无遗言", () => {
    const { s } = intoDawn(3);
    recordLastWords(s, s.lastWordsPending[0], "遗言");
    beginSpeeches(s);
    while (s.phase === "speech") recordSpeech(s, currentSpeaker(s), "过");
    const wolfId = alive(s).find((id) => roleOf(s, id) === "wolf")!;
    submitVotes(s, unanimous(s, wolfId));
    const exiled = (s.events.filter((e) => e.type === "exile").at(-1) as { player: number }).player;
    recordLastWords(s, exiled, "遗言");
    beginNight(s);
    expect(s.day).toBe(2);
    const victim2 = alive(s).find((id) => roleOf(s, id) !== "wolf")!;
    setWolfKill(s, victim2);
    seerAction(s);
    expect(s.lastWordsPending).toEqual([]);
  });

  it("遗言清空前不能开夜/发言", () => {
    const { s } = intoDawn(3);
    expect(() => beginSpeeches(s)).toThrow();
    expect(() => beginNight(s)).toThrow();
  });

  it("recordSpeech 校验顺序与内容", () => {
    const { s } = intoDawn(3);
    recordLastWords(s, s.lastWordsPending[0], "遗言");
    beginSpeeches(s);
    expect(() => recordSpeech(s, s.speechOrder[1], "抢话")).toThrow();
    expect(() => recordSpeech(s, s.speechOrder[0], "")).toThrow();
    recordSpeech(s, s.speechOrder[0], "我是好人");
    expect(s.speechIndex).toBe(1);
    expect(s.events.some((e) => e.type === "speech" && e.player === s.speechOrder[0])).toBe(true);
  });

  it("发言完毕进入投票阶段", () => {
    const { s } = intoDawn(3);
    recordLastWords(s, s.lastWordsPending[0], "遗言");
    beginSpeeches(s);
    while (s.phase === "speech") recordSpeech(s, currentSpeaker(s), "过");
    expect(s.phase).toBe("vote");
    expect(s.speeches).toHaveLength(6);
  });
});

describe("投票与放逐", () => {
  it("唯一最高票放逐，产生遗言资格，之后进入下一夜", () => {
    const { s } = intoVote(5);
    const target = alive(s)[0];
    submitVotes(s, unanimous(s, target));
    expect(s.events.at(-2)).toMatchObject({ type: "vote_result", exiled: target });
    expect(s.events.at(-1)).toMatchObject({ type: "exile", player: target });
    expect(s.players.find((p) => p.id === target)!.alive).toBe(false);
    expect(s.lastWordsPending).toEqual([target]);
    recordLastWords(s, target, "遗言");
    expect(afterLastWords(s)).toBe("night");
  });

  it("放逐/出局后 checkWin 触发狼胜", () => {
    const s = createGame({ id: "t", seed: 5, aiPlayers: AI6, humanName: "你" });
    const goods = s.players.filter((p) => p.role !== "wolf");
    goods.forEach((g) => (g.alive = false));
    goods[0].alive = true; // 2 狼 vs 1 好
    expect(checkWin(s)).toBe(true);
    expect(s.winner).toBe("wolf");
    expect(s.phase).toBe("game_over");
    expect(s.events.at(-1)?.type).toBe("game_over");
  });

  it("狼全灭好人胜", () => {
    const s = createGame({ id: "t", seed: 5, aiPlayers: AI6, humanName: "你" });
    byRole(s, "wolf").forEach((w) => (w.alive = false));
    expect(checkWin(s)).toBe(true);
    expect(s.winner).toBe("good");
  });

  it("势均力敌时游戏继续", () => {
    const s = createGame({ id: "t", seed: 5, aiPlayers: AI6, humanName: "你" });
    expect(checkWin(s)).toBe(false);
    expect(s.phase).toBe("setup");
  });

  it("平票进入 PK 发言，PK 投票唯一最高票放逐", () => {
    const { s } = intoVote(5);
    const voters = alive(s); // 6 人
    const a = voters[0];
    const b = voters[1];
    submitVotes(s, voters.map((voter, i) => ({ voter, target: i < 3 ? a : b })));
    expect(s.phase).toBe("pk_speech");
    expect(s.pkCandidates).toEqual([a, b].sort((x, y) => x - y));
    while (s.phase === "pk_speech") recordSpeech(s, currentSpeaker(s), "PK 发言");
    expect(s.phase).toBe("pk_vote");
    submitVotes(s, alive(s).map((voter) => ({ voter, target: a })));
    expect(s.players.find((p) => p.id === a)!.alive).toBe(false);
    expect(s.lastWordsPending).toEqual([a]);
    recordLastWords(s, a, "遗言");
    expect(afterLastWords(s)).toBe("night");
  });

  it("PK 再平票则无人出局，直接进入下一夜", () => {
    const { s } = intoVote(5);
    const voters = alive(s);
    const a = voters[0];
    const b = voters[1];
    submitVotes(s, voters.map((voter, i) => ({ voter, target: i < 3 ? a : b })));
    while (s.phase === "pk_speech") recordSpeech(s, currentSpeaker(s), "PK");
    submitVotes(s, alive(s).map((voter, i) => ({ voter, target: i < 3 ? a : b })));
    expect(s.phase).toBe("dawn");
    expect(afterLastWords(s)).toBe("night");
    expect(s.players.find((p) => p.id === a)!.alive).toBe(true);
  });

  it("越界目标按弃票兜底并标记 fallback", () => {
    const { s } = intoVote(5);
    const target = alive(s)[0];
    const votes = unanimous(s, target);
    votes[0].target = 99;
    submitVotes(s, votes);
    expect(s.votes[0].target).toBeNull();
    expect(s.votes[0].fallback).toBe(true);
  });

  it("重复投票与票数不完整都会抛错", () => {
    const { s } = intoVote(5);
    const target = alive(s)[0];
    const dup = unanimous(s, target);
    dup[1].voter = dup[0].voter;
    expect(() => submitVotes(s, dup)).toThrow();
    expect(() => submitVotes(s, unanimous(s, target).slice(1))).toThrow();
  });
});

describe("完整对局驱动（集成）", () => {
  /** 脚本化跑完整局：狼刀第一个好人，预言家查任意人，好人全投狼（上帝视角），狼投第一个好人 */
  function playFull(seed: number, withHuman: boolean): GameState {
    const s = createGame({
      id: "full",
      seed,
      aiPlayers: withHuman ? AI6 : AI7,
      humanName: withHuman ? "你" : undefined,
      humanId: withHuman ? 4 : undefined,
    });
    let guard = 0;
    while (s.phase !== "game_over" && guard++ < 300) {
      const aliveIds = alive(s);
      switch (s.phase) {
        case "setup":
          beginNight(s);
          break;
        case "night_wolf":
          setWolfKill(s, aliveIds.find((id) => roleOf(s, id) !== "wolf")!);
          break;
        case "night_seer":
          seerAction(s);
          break;
        case "dawn":
          if (s.lastWordsPending.length > 0) {
            recordLastWords(s, s.lastWordsPending[0], "我的遗言");
          } else if (afterLastWords(s) === "speech") {
            beginSpeeches(s);
          } else {
            beginNight(s);
          }
          break;
        case "speech":
        case "pk_speech":
          recordSpeech(s, currentSpeaker(s), "我认为 1 号有问题");
          break;
        case "vote":
        case "pk_vote": {
          const wolvesIds = byRole(s, "wolf").map((w) => w.id);
          const candidates = s.phase === "pk_vote" ? s.pkCandidates : aliveIds;
          const target = candidates.find((id) => wolvesIds.includes(id)) ?? candidates[0];
          submitVotes(s, aliveIds.map((voter) => ({ voter, target })));
          break;
        }
        case "game_over":
          break;
      }
      checkWin(s);
    }
    return s;
  }

  it.each([1, 2, 3, 42, 99, 123])("seed %i 有人局能完整打到终局且事件自洽", (seed) => {
    const s = playFull(seed, true);
    expect(s.phase).toBe("game_over");
    expect(s.winner).not.toBeNull();
    const wolvesAlive = s.players.filter((p) => p.alive && p.role === "wolf").length;
    const goodAlive = s.players.filter((p) => p.alive && p.role !== "wolf").length;
    if (s.winner === "good") expect(wolvesAlive).toBe(0);
    else expect(wolvesAlive).toBeGreaterThanOrEqual(goodAlive);
    expect(s.events.at(-1)?.type).toBe("game_over");
    expect(s.day).toBeGreaterThanOrEqual(1);
    const days = s.events.filter((e) => "day" in e).map((e) => e.day);
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThanOrEqual(days[i - 1]);
  });

  it.each([1, 7, 2024])("seed %i 纯 AI 局能完整打到终局", (seed) => {
    const s = playFull(seed, false);
    expect(s.phase).toBe("game_over");
  });
});

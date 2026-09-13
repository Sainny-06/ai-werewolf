// AI 行为评测：自动跑 N 局纯 AI 对局，统计行为质量指标，产出 evals/report.md。
// 无 API Key 时跑 Mock 基线；配置 ZHIPU_API_KEY 后同一命令得到真实模型对照数据。
// 用法：npm run eval -- [局数，默认 10]

import { mkdirSync, writeFileSync } from "node:fs";
import { createRuntimeGame, runBeat, withLock } from "@/lib/game/runtime";
import type { GameState } from "@/lib/game/types";
import { hasRealLLM } from "@/lib/llm/callLLM";
import { db } from "@/lib/db";

interface GameMetrics {
  id: string;
  winner: "wolf" | "good";
  days: number;
  goodVoteCorrectRate: number; // 好人投给真狼的票占比
  exileAccuracy: number; // 被放逐者中真狼占比
  wolfAvgSurvival: number; // 狼平均存活天数
  fallbackRate: number; // 结构化输出失败触发兜底的票占比
}

function analyze(state: GameState): GameMetrics {
  const wolfIds = new Set(state.players.filter((p) => p.role === "wolf").map((p) => p.id));
  let goodVotes = 0;
  let goodCorrect = 0;
  let totalVoteCount = 0;
  let fallbackCount = 0;
  let exiles = 0;
  let exileHits = 0;
  const deathDay = new Map<number, number>();

  for (const e of state.events) {
    if (e.type === "vote_result") {
      for (const v of e.votes) {
        totalVoteCount += 1;
        if (v.fallback) fallbackCount += 1;
        const voter = state.players.find((p) => p.id === v.voter)!;
        if (voter.role !== "wolf" && v.target !== null) {
          goodVotes += 1;
          if (wolfIds.has(v.target)) goodCorrect += 1;
        }
      }
      if (e.exiled !== null) {
        exiles += 1;
        if (wolfIds.has(e.exiled)) exileHits += 1;
      }
    }
    if (e.type === "dawn") for (const d of e.deaths) deathDay.set(d, e.day);
    if (e.type === "exile") deathDay.set(e.player, e.day);
  }

  const wolves = state.players.filter((p) => p.role === "wolf");
  const wolfSurvival = wolves.map((w) => deathDay.get(w.id) ?? state.day);

  return {
    id: state.id,
    winner: state.winner ?? "good",
    days: state.day,
    goodVoteCorrectRate: goodVotes > 0 ? goodCorrect / goodVotes : 0,
    exileAccuracy: exiles > 0 ? exileHits / exiles : 0,
    wolfAvgSurvival: wolfSurvival.reduce((a, b) => a + b, 0) / wolves.length,
    fallbackRate: totalVoteCount > 0 ? fallbackCount / totalVoteCount : 0,
  };
}

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
}

async function main() {
  const N = Number(process.argv[2] ?? 10);
  const mode = hasRealLLM() ? "glm（真实模型）" : "mock（朴素基线）";
  console.log(`开始评测：${N} 局纯 AI 对局，模式=${mode}`);

  const results: GameMetrics[] = [];
  for (let i = 0; i < N; i++) {
    const state = await createRuntimeGame({ seed: 97000 + i * 17 });
    let guard = 500;
    while (state.phase !== "game_over" && guard-- > 0) {
      await withLock(state.id, () => runBeat(state));
    }
    if (state.phase !== "game_over") {
      throw new Error(`对局 #${i + 1}（${state.id}）在 500 个节拍内未结束，疑似卡死`);
    }
    results.push(analyze(state));
    console.log(
      `#${String(i + 1).padStart(2, "0")} ${state.winner === "wolf" ? "🐺狼胜" : "🌅好人胜"} · ${state.day} 天 · 好人投票正确率 ${Math.round(
        results[i].goodVoteCorrectRate * 100
      )}%`
    );
  }

  const agg = {
    games: N,
    mode: hasRealLLM() ? "glm" : "mock",
    goodWinRate: avg(results.map((r) => (r.winner === "good" ? 1 : 0))),
    avgDays: avg(results.map((r) => r.days)),
    goodVoteCorrectRate: avg(results.map((r) => r.goodVoteCorrectRate)),
    exileAccuracy: avg(results.map((r) => r.exileAccuracy)),
    wolfAvgSurvival: avg(results.map((r) => r.wolfAvgSurvival)),
    fallbackRate: avg(results.map((r) => r.fallbackRate)),
  };

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const report = `# AI 行为评测报告

- 时间：${new Date().toLocaleString("zh-CN")}
- 模式：${mode}
- 局数：${N} 局 7 人局（2 狼 / 1 预言家 / 4 村民，无人类）

## 汇总指标

| 指标 | 数值 | 含义 |
|---|---|---|
| 好人阵营胜率 | ${pct(agg.goodWinRate)} | 越接近 50% 说明博弈越平衡 |
| 平均局长 | ${agg.avgDays.toFixed(1)} 天 | 天数越少节奏越快 |
| 好人投票正确率 | ${pct(agg.goodVoteCorrectRate)} | 好人票投中真狼的比例（AI 推理质量核心指标） |
| 放逐准确率 | ${pct(agg.exileAccuracy)} | 被放逐者中真狼的比例 |
| 狼人平均存活 | ${agg.wolfAvgSurvival.toFixed(1)} 天 | 反映狼的伪装能力 |
| 输出兜底率 | ${pct(agg.fallbackRate)} | 结构化输出校验失败触发兜底的票占比（应接近 0） |

## 明细

| # | 对局 | 胜方 | 天数 | 好人投票正确率 | 放逐准确率 |
|---|---|---|---|---|---|
${results
  .map(
    (r, i) =>
      `| ${i + 1} | ${r.id} | ${r.winner === "wolf" ? "狼人" : "好人"} | ${r.days} | ${pct(
        r.goodVoteCorrectRate
      )} | ${pct(r.exileAccuracy)} |`
  )
  .join("\n")}
`;

  mkdirSync("evals", { recursive: true });
  const modeTag = hasRealLLM() ? "glm" : "mock";
  writeFileSync(`evals/report-${modeTag}.md`, report, "utf8");
  writeFileSync(`evals/latest-${modeTag}.json`, JSON.stringify({ agg, results }, null, 2), "utf8");
  console.log("\n汇总：");
  console.log(
    JSON.stringify(
      Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, typeof v === "number" ? Number(v.toFixed(3)) : v])),
      null,
      2
    )
  );
  console.log(`报告已写入 evals/report-${modeTag}.md`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

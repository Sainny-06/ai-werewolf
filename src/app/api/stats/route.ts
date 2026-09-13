// Token 用量与成本统计（成本看板数据源）

import { db } from "@/lib/db";
import { hasRealLLM } from "@/lib/llm/callLLM";

export const dynamic = "force-dynamic";

export async function GET() {
  const calls = await db.lLMCall.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });

  const byFeature = new Map<string, { count: number; totalTokens: number; latencyTotal: number; fallbacks: number }>();
  const byModel = new Map<string, { count: number; totalTokens: number; provider: string }>();
  let totalTokens = 0;
  let fallbacks = 0;

  for (const c of calls) {
    totalTokens += c.totalTokens;
    if (c.fallback) fallbacks += 1;
    const f = byFeature.get(c.feature) ?? { count: 0, totalTokens: 0, latencyTotal: 0, fallbacks: 0 };
    f.count += 1;
    f.totalTokens += c.totalTokens;
    f.latencyTotal += c.latencyMs;
    if (c.fallback) f.fallbacks += 1;
    byFeature.set(c.feature, f);
    const m = byModel.get(c.model) ?? { count: 0, totalTokens: 0, provider: c.provider };
    m.count += 1;
    m.totalTokens += c.totalTokens;
    byModel.set(c.model, m);
  }

  const finished = await db.game.count({ where: { winner: { not: null } } });

  return Response.json({
    mode: hasRealLLM() ? "glm" : "mock",
    totalCalls: calls.length,
    totalTokens,
    fallbacks,
    finishedGames: finished,
    byFeature: [...byFeature.entries()].map(([feature, v]) => ({
      feature,
      count: v.count,
      totalTokens: v.totalTokens,
      avgLatencyMs: v.count > 0 ? Math.round(v.latencyTotal / v.count) : 0,
      fallbacks: v.fallbacks,
    })),
    byModel: [...byModel.entries()].map(([model, v]) => ({ model, provider: v.provider, count: v.count, totalTokens: v.totalTokens })),
  });
}

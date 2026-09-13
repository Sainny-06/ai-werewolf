// HTTP 层端到端冒烟：对着运行中的服务（npm run start / dev）自动玩一局人类对局。
// 用法：先启动服务，再 npx tsx scripts/smoke.ts
// 自动决策：夜晚按第一个候选行动，发言/遗言固定话术，投第一个候选。

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

interface StepResult {
  type: string;
  events?: { type: string }[];
  awaiting?: { kind: string; candidates: number[]; player: number } | null;
  done?: boolean;
  state?: { phase: string; day: number; winner: string | null };
  message?: string;
}

async function stepOnce(gameId: string): Promise<StepResult> {
  const res = await fetch(`${BASE}/api/games/${gameId}/step`, { method: "POST" });
  if (!res.ok && res.status !== 200) throw new Error(`step HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.split("\n").filter((l) => l.startsWith("data:"));
  if (lines.length === 0) throw new Error(`step 响应中没有 SSE 数据：${text.slice(0, 200)}`);
  return JSON.parse(lines[lines.length - 1].slice(5).trim());
}

async function act(gameId: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASE}/api/games/${gameId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`action 失败：${data.error}`);
}

async function main() {
  const health = await fetch(`${BASE}/api/stats`);
  if (!health.ok) throw new Error(`服务未就绪：${health.status}`);
  const stats0 = (await health.json()) as { mode: string };
  console.log(`服务就绪（模式=${stats0.mode}），开始冒烟对局……`);

  const created = await fetch(`${BASE}/api/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ humanName: "冒烟员" }),
  }).then((r) => r.json());
  const id = created.id as string;
  console.log(`对局已创建：${id}`);

  let steps = 0;
  let guard = 400;
  let r = await stepOnce(id);
  while (!r.done && guard-- > 0) {
    steps += 1;
    if (r.type === "error") throw new Error(`服务端错误：${r.message}`);
    const a = r.awaiting;
    if (a) {
      console.log(`  等待人类输入：${a.kind}（第 ${r.state?.day} 天）`);
      const target = a.candidates.length > 0 ? a.candidates[0] : null;
      if (a.kind === "speech") await act(id, { kind: "speech", content: "我观察了一下，先听大家的。" });
      else if (a.kind === "last_words") await act(id, { kind: "last_words", content: "大家注意 3 号，我的直觉。" });
      else if (a.kind === "wolf_kill") await act(id, { kind: "wolf_kill", target });
      else if (a.kind === "seer_check") await act(id, { kind: "seer_check", target });
      else if (a.kind === "vote" || a.kind === "pk_vote") await act(id, { kind: a.kind, target });
      r = await stepOnce(id);
      continue;
    }
    r = await stepOnce(id);
  }
  if (!r.done) throw new Error(`400 次节拍内未终局，疑似卡死（phase=${r.state?.phase}）`);

  const final = (await fetch(`${BASE}/api/games/${id}`).then((x) => x.json())) as {
    winner: string;
    players: { id: number; role: string; alive: boolean }[];
  };
  console.log(`✅ 冒烟通过：${steps} 个节拍，胜方=${final.winner}，身份揭示=${final.players.map((p) => `${p.id}:${p.role}`).join(" ")}`);
  const stats = (await fetch(`${BASE}/api/stats`).then((x) => x.json())) as { totalCalls: number; fallbacks: number };
  console.log(`✅ 埋点正常：累计 LLM 调用 ${stats.totalCalls} 次，兜底 ${stats.fallbacks} 次`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 冒烟失败：", err);
  process.exit(1);
});

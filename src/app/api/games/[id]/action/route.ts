// 人类玩家操作：夜晚行动 / 发言 / 遗言 / 投票

import { loadGame, submitHumanAction, withLock } from "@/lib/game/runtime";
import { toPublicState } from "@/lib/game/publicState";
import { GameError } from "@/lib/game/types";

export const dynamic = "force-dynamic";

interface ActionBody {
  kind: "wolf_kill" | "seer_check" | "speech" | "last_words" | "vote" | "pk_vote";
  target?: number | null;
  content?: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await loadGame(id);
  if (!state) return Response.json({ error: "对局不存在" }, { status: 404 });

  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  try {
    const result = await withLock(id, async () => {
      const r = await submitHumanAction(state, body);
      return { ...r, state: toPublicState(state) };
    });
    return Response.json(result);
  } catch (err) {
    const message = err instanceof GameError || err instanceof Error ? err.message : "操作失败";
    return Response.json({ error: message }, { status: 400 });
  }
}

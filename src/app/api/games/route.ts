import { createRuntimeGame } from "@/lib/game/runtime";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 创建对局。body: { humanName?: string }，不传则纯 AI 局 */
export async function POST(req: Request) {
  let humanName: string | undefined;
  try {
    const body = (await req.json()) as { humanName?: string };
    humanName = body.humanName?.trim().slice(0, 12) || undefined;
  } catch {
    humanName = undefined;
  }
  const state = await createRuntimeGame({ humanName: humanName ?? "你" });
  return Response.json({ id: state.id });
}

/** 已结束的对局列表（回放入口） */
export async function GET() {
  const games = await db.game.findMany({
    where: { winner: { not: null } },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, winner: true, createdAt: true, updatedAt: true },
  });
  return Response.json({ games });
}

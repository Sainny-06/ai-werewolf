import { loadGame } from "@/lib/game/runtime";
import { toPublicState } from "@/lib/game/publicState";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await loadGame(id);
  if (!state) return Response.json({ error: "对局不存在" }, { status: 404 });
  return Response.json(toPublicState(state));
}

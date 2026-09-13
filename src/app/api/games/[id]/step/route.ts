// 节拍推进接口（SSE 流式）：一次请求推进一个节拍。
// 发言类节拍会实时推送 delta 增量文本，最后统一回 result（含公开状态投影）。

import { loadGame, runBeat, withLock } from "@/lib/game/runtime";
import { toPublicState } from "@/lib/game/publicState";
import { GameError } from "@/lib/game/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await loadGame(id);
  if (!state) return Response.json({ error: "对局不存在" }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      try {
        await withLock(id, async () => {
          const result = await runBeat(state, (player, text) => send({ type: "delta", player, text }));
          send({ type: "result", events: result.events, awaiting: result.awaiting, done: result.done, state: toPublicState(state) });
        });
      } catch (err) {
        const message =
          err instanceof GameError
            ? `规则错误：${err.message}`
            : err instanceof Error
              ? `服务异常：${err.message.slice(0, 200)}`
              : "未知错误";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

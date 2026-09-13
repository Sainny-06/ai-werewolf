import { db } from "@/lib/db";

export interface LLMCallLog {
  gameId?: string | null;
  feature: string;
  model: string;
  provider: "glm" | "mock";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  fallback?: boolean;
}

/** Token 埋点落库。埋点失败绝不影响游戏主流程。 */
export async function logLLMCall(entry: LLMCallLog): Promise<void> {
  try {
    await db.lLMCall.create({ data: entry });
  } catch {
    // 埋点是旁路，失败静默
  }
}

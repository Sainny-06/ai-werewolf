// 统一 LLM 入口：模型路由 + 重试退避 + 流式增量 + Token 埋点。
// 未配置 ZHIPU_API_KEY 时抛出 LLMUnavailable，由 agents 层决定降级到 Mock。

import { logLLMCall } from "./log";
import type { LLMCallOptions, LLMResult } from "./types";

const GLM_BASE = process.env.ZHIPU_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4";

export function hasRealLLM(): boolean {
  return Boolean(process.env.ZHIPU_API_KEY);
}

export class LLMUnavailable extends Error {
  constructor() {
    super("未配置 ZHIPU_API_KEY，LLM 不可用");
    this.name = "LLMUnavailable";
  }
}

/** 模型路由：决策类（投票/刀/查验）与发言类可配置不同模型，成本与质量分开把控 */
export function modelFor(feature: string): string {
  const decisionFeatures = ["vote", "wolf_kill", "seer_check"];
  return decisionFeatures.includes(feature)
    ? process.env.LLM_MODEL_DECIDE ?? "glm-4-flash"
    : process.env.LLM_MODEL_SPEECH ?? "glm-4-flash";
}

const RETRIES = 2;
const TIMEOUT_MS = 45_000;

function estimateTokens(text: string): number {
  // 无 usage 时的粗估：中文约 1 字 1 token，按保守 1.5 字/token
  return Math.max(1, Math.ceil(text.length / 1.5));
}

export async function callLLM(opts: LLMCallOptions): Promise<LLMResult> {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) throw new LLMUnavailable();
  const model = modelFor(opts.feature);
  const started = Date.now();
  let lastErr: unknown;

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await requestGLM(apiKey, model, opts);
      const latencyMs = Date.now() - started;
      const promptTokens = res.usage?.prompt_tokens ?? estimateTokens(opts.messages.map((m) => m.content).join("\n"));
      const completionTokens = res.usage?.completion_tokens ?? estimateTokens(res.text);
      void logLLMCall({
        gameId: opts.gameId ?? null,
        feature: opts.feature,
        model,
        provider: "glm",
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        latencyMs,
      });
      return {
        text: res.text,
        model,
        provider: "glm",
        promptTokens,
        completionTokens,
        latencyMs,
      };
    } catch (err) {
      lastErr = err;
      if (opts.signal?.aborted) throw err;
      if (attempt < RETRIES) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  void logLLMCall({
    gameId: opts.gameId ?? null,
    feature: opts.feature,
    model,
    provider: "glm",
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    latencyMs: Date.now() - started,
    fallback: true,
  });
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

interface GLMResponse {
  choices?: { message?: { content?: string }; delta?: { content?: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

async function requestGLM(
  apiKey: string,
  model: string,
  opts: LLMCallOptions
): Promise<{ text: string; usage?: { prompt_tokens: number; completion_tokens: number } }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (opts.signal) opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const streaming = Boolean(opts.onDelta);
    const res = await fetch(`${GLM_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.8,
        max_tokens: opts.maxTokens ?? 512,
        stream: streaming,
        ...(streaming ? { stream_options: { include_usage: true } } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GLM HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    if (!streaming) {
      const json = (await res.json()) as GLMResponse;
      const text = json.choices?.[0]?.message?.content ?? "";
      return { text, usage: json.usage };
    }
    // 流式：逐段回调并拼装完整文本
    return await consumeStream(res, opts.onDelta!);
  } finally {
    clearTimeout(timer);
  }
}

async function consumeStream(
  res: Response,
  onDelta: (text: string) => void
): Promise<{ text: string; usage?: { prompt_tokens: number; completion_tokens: number } }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let usage: { prompt_tokens: number; completion_tokens: number } | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload) as GLMResponse;
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          onDelta(delta);
        }
        if (chunk.usage) usage = chunk.usage;
      } catch {
        // 忽略不完整分片
      }
    }
  }
  return { text, usage };
}

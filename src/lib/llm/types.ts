// LLM 调用层类型。所有 AI 玩家的模型交互统一走 callLLM()。

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCallOptions {
  /** 业务功能标记，用于模型路由与埋点：speech / vote / wolf_kill / seer_check / last_words */
  feature: string;
  gameId?: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  /** 传入则在流式模式下逐段回调增量文本 */
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

export interface LLMResult {
  text: string;
  model: string;
  provider: "glm" | "mock";
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

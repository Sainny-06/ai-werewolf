// AI 玩家统一驱动器：有 Key 走真实 GLM（JSON 校验 + 重试），没 Key 降级 Mock。
// 兜底原则：驱动器只负责重试，重试耗尽抛 AgentFallback，由运行时用规则引擎侧的兜底方案接住，游戏永不卡死。

import { callLLM, hasRealLLM } from "@/lib/llm/callLLM";
import { speechMessages, voteMessages, wolfKillMessages, wolfSuggestionMessages, seerCheckMessages, lastWordsMessages } from "./prompts";
import type { AgentView } from "./context";
import { mockDriver } from "./mockAgent";

export class AgentFallback extends Error {
  constructor(feature: string) {
    super(`AI 输出多次校验失败，触发兜底：${feature}`);
    this.name = "AgentFallback";
  }
}

export interface AgentDriver {
  speech(view: AgentView, onDelta?: (t: string) => void): Promise<string>;
  lastWords(view: AgentView, opts: { exiled: boolean }, onDelta?: (t: string) => void): Promise<string>;
  wolfKill(view: AgentView, candidates: number[]): Promise<{ target: number; suggestion?: string }>;
  wolfSuggestion(view: AgentView): Promise<string>;
  seerCheck(view: AgentView, candidates: number[]): Promise<{ target: number }>;
  vote(view: AgentView, candidates: number[]): Promise<{ target: number; reason: string }>;
}

export function getDriver(): AgentDriver {
  return hasRealLLM() ? realDriver : mockDriver;
}

function parseJsonLoose(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("输出中找不到 JSON");
  return JSON.parse(match[0]) as Record<string, unknown>;
}

function cleanText(text: string): string {
  return text
    .replace(/```[a-z]*|```/g, "")
    .replace(/^[「"']|[」"']$/g, "")
    .trim();
}

/** 带重试的 JSON 决策：校验失败把错误喂回去让模型自纠，最多 3 次 */
async function decideJson<T>(
  view: AgentView,
  feature: string,
  build: (hint?: string) => { system: string; user: string },
  validate: (json: Record<string, unknown>) => T
): Promise<T> {
  let hint: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const m = build(hint);
    const res = await callLLM({
      feature,
      gameId: view.gameId,
      messages: [
        { role: "system", content: m.system },
        { role: "user", content: m.user },
      ],
      temperature: 0.6,
      maxTokens: 140,
    });
    try {
      return validate(parseJsonLoose(res.text));
    } catch (err) {
      hint = `你上一次的输出不符合要求（${err instanceof Error ? err.message : "解析失败"}）。请严格只输出一个 JSON 对象，不要任何多余文字。`;
    }
  }
  throw new AgentFallback(feature);
}

const realDriver: AgentDriver = {
  async speech(view, onDelta) {
    const m = speechMessages(view);
    const res = await callLLM({
      feature: "speech",
      gameId: view.gameId,
      messages: [
        { role: "system", content: m.system },
        { role: "user", content: m.user },
      ],
      temperature: 0.9,
      maxTokens: 140,
      onDelta,
    });
    return cleanText(res.text);
  },

  async lastWords(view, opts, onDelta) {
    const m = lastWordsMessages(view, opts);
    const res = await callLLM({
      feature: "last_words",
      gameId: view.gameId,
      messages: [
        { role: "system", content: m.system },
        { role: "user", content: m.user },
      ],
      temperature: 0.9,
      maxTokens: 140,
      onDelta,
    });
    return cleanText(res.text);
  },

  async wolfKill(view, candidates) {
    return decideJson(
      view,
      "wolf_kill",
      (hint) => {
        const m = wolfKillMessages(view, candidates);
        return { system: m.system, user: m.user + (hint ? `\n\n${hint}` : "") };
      },
      (json) => {
        const target = Number(json.target);
        if (!candidates.includes(target)) throw new Error(`target 必须是候选 ${candidates.join("/")} 之一`);
        return {
          target,
          suggestion: typeof json.suggestion === "string" ? json.suggestion.slice(0, 40) : undefined,
        };
      }
    );
  },

  async wolfSuggestion(view) {
    const m = wolfSuggestionMessages(view);
    const res = await callLLM({
      feature: "wolf_kill",
      gameId: view.gameId,
      messages: [
        { role: "system", content: m.system },
        { role: "user", content: m.user },
      ],
      temperature: 0.8,
      maxTokens: 100,
    });
    return cleanText(res.text);
  },

  async seerCheck(view, candidates) {
    return decideJson(
      view,
      "seer_check",
      (hint) => {
        const m = seerCheckMessages(view, candidates);
        return { system: m.system, user: m.user + (hint ? `\n\n${hint}` : "") };
      },
      (json) => {
        const target = Number(json.target);
        if (!candidates.includes(target)) throw new Error(`target 必须是候选 ${candidates.join("/")} 之一`);
        return { target };
      }
    );
  },

  async vote(view, candidates) {
    return decideJson(
      view,
      "vote",
      (hint) => {
        const m = voteMessages(view, candidates, { isPk: view.isPk });
        return { system: m.system, user: m.user + (hint ? `\n\n${hint}` : "") };
      },
      (json) => {
        const target = Number(json.target);
        if (!candidates.includes(target)) throw new Error(`target 必须是候选 ${candidates.join("/")} 之一`);
        const reason = typeof json.reason === "string" ? json.reason.slice(0, 30) : "";
        return { target, reason };
      }
    );
  },
};

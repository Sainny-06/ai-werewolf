// Mock 行为引擎：无 API Key 时的降级实现（provider="mock"）。
// 策略刻意做成"朴素基线"：狼乱刀、好人凭直觉乱投——评测脚本跑 Mock 局得到的就是这条基线，
// 接入真实模型后的提升幅度才有对照意义。

import type { AgentView } from "./context";
import { logLLMCall } from "@/lib/llm/log";
import { hasRealLLM } from "@/lib/llm/callLLM";
import type { AgentDriver } from "./index";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function others(view: AgentView, candidates: number[]): number[] {
  return candidates.filter((c) => c !== view.playerId);
}

function suspectLine(view: AgentView, target: number): string {
  const templates = [
    `${target}号刚才那段话逻辑对不上，我盯他很久了。`,
    `大家品品${target}号的发言，一直在和稀泥，不对劲。`,
    `${target}号一整天都在跟风，自己一点判断都没有，狼味。`,
    `我不管你们怎么说，${target}号的眼神（发言）已经出卖了他。`,
  ];
  return pick(templates);
}

function mockLog(view: AgentView, feature: string) {
  void logLLMCall({
    gameId: view.gameId,
    feature,
    model: "mock-baseline",
    provider: "mock",
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    latencyMs: 0,
  });
}

export const mockDriver: AgentDriver = {
  async speech(view, onDelta) {
    mockLog(view, "speech");
    let content: string;
    if (view.isPk) {
      content = pick([
        `哎哟，投我出局才是帮狼！${others(view, view.aliveIds)[0]}号才是真狼，睁大眼睛！`,
        `呵，把好人投出去，今晚你们就知道了。听我一句，别犯糊涂。`,
      ]);
    } else if (view.role === "seer" && view.day >= 2 && view.seerKnowledge.length > 0) {
      const k = view.seerKnowledge[view.seerKnowledge.length - 1];
      content = `听我说，我是预言家！${k.target}号我查过，是${k.result === "wolf" ? "狼人，今天就投他" : "好人，别冤枉他"}。信我。`;
    } else if (view.role === "wolf") {
      const target = pick(others(view, view.aliveIds.filter((id) => !view.teammates.includes(id))));
      content = suspectLine(view, target);
    } else {
      const target = pick(others(view, view.aliveIds));
      content = suspectLine(view, target);
    }
    onDelta?.(content);
    return content;
  },

  async lastWords(view, opts, onDelta) {
    mockLog(view, "last_words");
    let content: string;
    if (view.role === "wolf") {
      content = pick([
        `行，我是狼，但我队友还在场上，你们输定了。呵。`,
        `被你们抓到了，不过别高兴太早，想想谁一直没被投过。`,
      ]);
    } else if (opts.exiled) {
      content = `我是好人啊！${others(view, view.aliveIds)[0]}号才是狼，记住我的话。`;
    } else {
      content = `昨晚刀我，说明我威胁到狼了。${others(view, view.aliveIds)[0]}号嫌疑最大，帮我盯着。`;
    }
    onDelta?.(content);
    return content;
  },

  async wolfKill(view, candidates) {
    mockLog(view, "wolf_kill");
    const target = pick(others(view, candidates.filter((c) => !view.teammates.includes(c))));
    return { target, suggestion: `刀${target}号，他白天最活跃。` };
  },

  async wolfSuggestion(view) {
    mockLog(view, "wolf_kill");
    const target = pick(others(view, view.aliveIds.filter((id) => !view.teammates.includes(id))));
    return `兄弟，刀${target}号，他昨天跳得最欢。`;
  },

  async seerCheck(view, candidates) {
    mockLog(view, "seer_check");
    const unchecked = others(view, candidates).filter((c) => !view.seerKnowledge.some((k) => k.target === c));
    return { target: pick(unchecked.length > 0 ? unchecked : others(view, candidates)) };
  },

  async vote(view, candidates) {
    mockLog(view, "vote");
    const options = others(view, candidates);
    let target: number;
    if (view.role === "wolf") {
      const goods = options.filter((c) => !view.teammates.includes(c));
      target = pick(goods.length > 0 ? goods : options);
    } else {
      target = pick(options);
    }
    return { target, reason: pick(["直觉", "他发言最飘", "说不上来，就是他", "跟风"]) };
  },
};

export function driverAvailable(): boolean {
  return !hasRealLLM();
}

# AGENTS.md — AI 狼人杀（ai-werewolf）

> 本文件是 AI 编程工具（ZCode / Cursor / Claude Code）的项目宪法。每次开新会话先读这个文件，再动手。

## 项目是什么

7 人局狼人杀网页游戏：**1 个人类玩家 + 6 个 LLM 玩家**。AI 玩家各有人设和隐藏身份，会发言、推理、撒谎、投票。核心卖点：信息隔离的上下文构建 + 确定性规则引擎 + AI 行为可评测。

业务需求看 `docs/PRD.md`，游戏规则唯一依据是 `docs/RULES.md`——实现与规则文档冲突时，以规则文档为准，并提醒用户更新文档。

## 技术栈（不要更换）

- Next.js 15（App Router）+ TypeScript（strict 模式）
- Tailwind CSS，UI 组件手写（游戏界面定制化程度高，不引组件库）
- Prisma + SQLite（本地开发）/ Neon Postgres（Vercel 部署）
- LLM：智谱 GLM（glm-4-flash 免费），OpenAI 兼容接口，所有调用统一走 `src/lib/llm/` 封装；未配置 Key 时自动降级 Mock 玩家
- 测试：Vitest，规则引擎必须有单元测试；HTTP 链路用 `npm run smoke` 冒烟

## 目录结构

```
src/
  app/            # 页面与 API 路由（App Router）
  components/     # 游戏视图组件（对局页与回放页共用）
  lib/
    game/         # 规则引擎（纯函数）、运行时 beat 驱动器、公开状态投影 publicState
    agents/       # AI 玩家：人设、上下文构建（信息隔离）、prompt、Mock 玩家
    llm/          # LLM 调用封装：callLLM()、模型路由、Token 埋点、重试
  tests/          # 单元测试
scripts/          # eval.ts（评测）、smoke.ts（HTTP 冒烟）
docs/             # PRD.md、RULES.md
evals/            # 评测报表
```

## 核心架构规则（不许违反）

1. **规则与 AI 分离**：阶段流转、生死处理、胜负判定只能写在 `src/lib/game/` 的纯函数里；LLM 永远不当裁判，不维护任何权威状态。
2. **信息隔离**：发给任何 LLM 的上下文必须经过 `buildContext(playerId)` 构建，禁止把其他玩家的私有信息（身份、查验结果、狼人夜聊）带进不对应玩家的 prompt。
3. **LLM 输出不可信**：所有决策类输出（投票/击杀/查验目标）必须 JSON 校验 + 重试（最多 2 次）+ 兜底（校验仍失败时由规则引擎随机决定），游戏任何情况下不能卡死。
4. **step 切片**：服务端一次请求只推进一个节拍（一句发言/一次投票/一个夜晚行动），不在单个请求里跑完整局。
5. **Token 埋点**：所有 LLM 调用必须走 `callLLM()`，自动记录 model / tokens / 耗时 / 所属功能，禁止绕过封装直接 fetch。

## 代码风格

- 组件用函数式 + hooks；业务逻辑放 `src/lib/`，不要塞进组件
- 中文注释，只写"为什么"不明显的地方；游戏状态字段命名与 RULES.md 术语一致（phase / alive / vote / check）
- 不使用 `any`；提交前不留 `console.log`

## 禁做事项

- 不引入新的重型依赖（状态管理库、动画库、WebSocket 等）——需要时先问用户
- 不做用户登录系统、不做联机对战、不做皮肤道具（见 PRD「明确不做」）
- 不修改 Prisma schema 而不生成 migration
- 不在 `src/lib/game/` 里写任何 LLM 调用

## 工作流约定

- 一个功能 = 一组修改 = 一个 commit，提交信息用中文：`feat: xxx` / `fix: xxx` / `test: xxx` / `docs: xxx`
- 每完成一个阶段任务：先 `npm run test`，再 `npm run build`，都过了才提交
- 大功能先出实现方案给用户确认，再写代码

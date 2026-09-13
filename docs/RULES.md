# 游戏规则文档 v1（7 人局 · 简化板）

> 本文档是规则引擎（`src/lib/game/`）的唯一实现依据。改规则先改这里，再改代码。
> 设计原则：规则全部由确定性代码执行；LLM 只负责"说话"和"做决策"，永远不当裁判。

## 1. 牌型与座位

- 7 名玩家，座位号 1–7，固定为：**狼人 ×2、预言家 ×1、村民 ×4**
- 开局时随机分配身份与座位，人类玩家的座位也随机
- 狼人互相知道队友是谁；预言家和村民只知道自己的身份
- 玩家出局后**不公布身份**（不翻牌），全部身份仅在结算画面公布

## 2. 阶段状态机

```
setup → night → dawn → speech → vote ─┬→ (唯一最高票) exile → win_check ─┐
                                      └→ (平票) pk_speech → pk_vote ──┤
                                                                      ↓
                              再平票 → 无人出局 → win_check → night（进入下一夜）
```

- 夜晚行动顺序固定：**狼人 → 预言家**
- `win_check` 在每次出局处理后立即执行；不满足胜利条件则进入下一夜

## 3. 夜晚阶段

### 3.1 狼人行动
- 选择**一名存活玩家**击杀（可以刀任意存活者，含狼人自己以外的任何人）
- 人类是狼：由人类选择目标，AI 队友先给出一条建议（普通文本）
- 人类不是狼（或已死）：由两名 AI 狼**共同决策**（一次 LLM 调用产出目标），避免重复调用

### 3.2 预言家行动
- 选择一名存活玩家查验，得知 `狼人 / 好人`
- 查验结果**仅预言家可见**；人类是预言家时直接显示给人类，AI 是预言家时写入其私有上下文

### 3.3 人类不是任何夜间角色时
- 显示"天黑请闭眼"过场，AI 行动完成后进入天亮

## 4. 天亮阶段

- 公布昨晚死亡玩家（被刀者出局）
- **遗言规则**：第 1 晚被刀者有遗言；第 2 晚起被刀者无遗言；被放逐者永远有遗言
- 遗言 ≤ 80 字（AI 生成或人类输入）

## 5. 白天发言阶段

- 发言顺序：从**昨晚死亡玩家座位号的下一位存活玩家**开始，按座位号递增循环一圈；同夜多名死者取最小座位号
- 每人每轮发言一条：
  - AI：流式生成上屏，**≤ 80 字**
  - 人类：文本输入，**≤ 120 字**，可以点"过"（发言内容记为「过」）
- 死亡玩家跳过，不发言
- 首夜被刀者的遗言在天亮公布后、白天发言开始前进行

## 6. 投票阶段

- **所有存活玩家**同时投票（包含人类）
  - AI：并行 LLM 调用，结构化输出 `{ target, reason }`，reason ≤ 30 字；投票目标必须是存活玩家（校验失败重试，仍失败由规则引擎随机指定存活者并标记 `fallback: true`）
  - 人类：界面点选
- **得票最多且唯一**者被放逐出局，有遗言
- **平票 PK**：
  1. 平票者各发言一条（顺序按座位号，≤ 80 字）
  2. 再次投票，**投票范围仅限平票者**（规则引擎校验，越界按弃票处理并标记 fallback）
  3. 仍平票 → 本轮无人出局，直接进入下一夜
- 弃票（人类主动选择"弃票"）计入弃票数，不投给任何人；AI 不允许弃票

## 7. 胜负判定（每次出局后检查）

- 狼人数 = 0 → **好人阵营胜**
- 狼人数 ≥ 好人数 → **狼人阵营胜**（本板子即：2 狼存活且好人只剩 ≤ 2 人）
- 两条件都不满足 → 游戏继续

## 8. 信息可见性矩阵（上下文构建的唯一依据）

| 信息 | AI/人类狼人 | AI/人类预言家 | 村民 |
|---|---|---|---|
| 自己的身份 | ✓ | ✓ | ✓ |
| 狼队友是谁 | ✓ | ✗ | ✗ |
| 夜刀结果（谁死了） | 公布 | 公布 | 公布 |
| 查验历史 | ✗ | 仅自己 | ✗ |
| 白天发言、遗言、投票结果（谁投了谁） | 公开 | 公开 | 公开 |
| 死者身份 | ✗ | ✗ | ✗ |
| 夜晚其他玩家是否行动过 | ✗ | ✗ | ✗ |

> "谁投了谁"公开含义：投票阶段结束后公布每人投给谁（带 AI 理由），供下一轮发言引用。

## 9. 回放记录格式

每局一个 JSON 对象（落库，`Game.stateJson`），`events` 按发生顺序记录全部节拍：

```ts
type GameEvent =
  | { type: 'game_start'; players: { id: number; name: string; persona: string }[] }
  | { type: 'night_start'; day: number }
  | { type: 'wolf_kill'; day: number; actors: number[]; target: number; suggestion?: string }
  | { type: 'seer_check'; day: number; actor: number; target: number; result: 'wolf' | 'good' }
  | { type: 'dawn'; day: number; deaths: number[] }
  | { type: 'last_words'; day: number; player: number; content: string }
  | { type: 'speech'; day: number; player: number; content: string }
  | { type: 'vote_result'; day: number; votes: { voter: number; target: number | null; reason?: string; fallback?: boolean }[]; exiled: number | null; isPk: boolean }
  | { type: 'exile'; day: number; player: number }
  | { type: 'game_over'; winner: 'wolf' | 'good'; players: { id: number; role: string; alive: boolean }[] }
```

> 回放页与实时对局共用同一事件流渲染；`wolf_kill` / `seer_check` 为夜间私有事件，对局结束前不对客户端下发，终局揭示。`last_words` 为独立事件（遗言内容生成晚于天亮公告）。

## 10. 术语表（代码命名以此为准）

| 术语 | 代码命名 | 含义 |
|---|---|---|
| 阶段 | `phase` | setup / night / dawn / speech / vote / pk_speech / pk_vote / game_over |
| 节拍 | `beat` | 服务端一次 step 请求推进的最小事件单位 |
| 存活 | `alive` | 玩家是否存活 |
| 放逐 | `exile` | 投票出局 |
| 查验 | `check` | 预言家行动，结果 `wolf / good` |
| 击杀 | `kill` | 狼人夜间行动 |
| 天数 | `day` | 从第 1 夜开始计数 |

const ROLES = ["狼人 ×2", "预言家 ×1", "村民 ×4"];

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-12 p-8">
      <div className="text-center space-y-5">
        <div className="text-6xl sm:text-7xl" aria-hidden>
          🌙
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-wide">
          AI 狼人杀
        </h1>
        <p className="text-slate-400 max-w-md mx-auto leading-relaxed">
          你和 6 个 LLM 玩家同桌。它们各有人设、各怀鬼胎——
          会伪装、会推理、会在天亮时把刀口指向你。
        </p>
      </div>

      <ul className="flex flex-wrap justify-center gap-2 text-sm">
        {ROLES.map((role) => (
          <li
            key={role}
            className="rounded-full border border-slate-800 bg-slate-900 px-4 py-1.5 text-slate-300"
          >
            {role}
          </li>
        ))}
      </ul>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-none sm:w-auto">
        <button
          disabled
          className="h-12 px-8 rounded-xl bg-amber-500 text-slate-950 font-semibold disabled:opacity-40 cursor-not-allowed"
        >
          开始游戏 · Week 1 上线
        </button>
        <button
          disabled
          className="h-12 px-8 rounded-xl border border-slate-700 text-slate-300 font-semibold disabled:opacity-40 cursor-not-allowed"
        >
          观看 AI 回放 · 开发中
        </button>
      </div>

      <footer className="text-xs text-slate-600 text-center">
        7 人局 · 信息隔离的上下文构建 · 确定性规则引擎 · 对局可回放
      </footer>
    </main>
  );
}

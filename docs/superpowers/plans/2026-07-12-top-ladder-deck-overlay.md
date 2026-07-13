# 左侧最高胜率卡组悬浮窗实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在炉石标准/狂野选牌与对局场景中，自动显示对应模式的国服近期最高胜率可靠样本卡组，并支持一键复制卡组代码。

**Architecture:** 主进程负责模式读取、公开统计获取、缓存、窗口生命周期与剪贴板；渲染层只接收经过校验的推荐卡组视图模型。推荐窗使用独立透明 Electron 窗口，位置与右侧记牌器分别贴合炉石窗口两侧；标准和狂野复用同一窗口并随模式切换数据。

**Tech Stack:** Electron、React、TypeScript、Vitest、Testing Library、现有本地 OCR/前台应用检测。

## Global Constraints

- 标准模式展示当前版本国服标准数据；狂野模式展示当前版本国服狂野数据。
- 只从达到最低场次门槛的卡组中选择胜率最高者。
- 胜率、场次和卡组代码必须来自同一条真实统计记录。
- 炉石不在前台时隐藏，返回后不抢焦点恢复。
- 竞技场、收藏页、未知模式不显示推荐窗。
- 外部数据必须运行时校验；失败要明确，禁止示例或伪造数据。
- 风格与右侧记牌器一致；不遮挡游戏主要区域。
- 不提交 Git commit。

---

### Task 1: 推荐卡组数据模型、来源适配与缓存

**Files:**
- Create: `src/shared/ladderDeckRecommendation.ts`
- Create: `src/main/ladderDeckRecommendationService.ts`
- Test: `tests/ladderDeckRecommendation.test.ts`
- Test: `tests/ladderDeckRecommendationService.test.ts`

**Interfaces:**
- Produces: `LadderMode = "standard" | "wild"`、`LadderDeckRecommendation`、`parseLadderDeckRecommendations(input)`、`selectTopLadderDeck(items, mode, minGames)`、`LadderDeckRecommendationService.get(mode)`。

- [ ] 先写失败测试：拒绝缺少模式、胜率、场次或卡组代码的数据；按模式和最低场次筛选后稳定选择最高胜率；并列时选择场次更多者。
- [ ] 运行 `npm test -- tests/ladderDeckRecommendation.test.ts tests/ladderDeckRecommendationService.test.ts`，确认测试先失败。
- [ ] 实现严格运行时校验、真实来源适配、超时请求、原子缓存和过期缓存标记；失败时返回清楚错误，不生成默认卡组。
- [ ] 再次运行上述测试并确认通过。

### Task 2: 左侧推荐窗界面与复制交互

**Files:**
- Create: `src/renderer/components/LadderDeckRecommendationPanel.tsx`
- Create: `src/renderer/ladderDeckRecommendationStyles.css`
- Modify: `src/renderer/main.tsx`
- Modify: `src/renderer/types.ts`
- Test: `tests/ladderDeckRecommendationPanel.test.tsx`

**Interfaces:**
- Consumes: `LadderDeckRecommendation`。
- Produces: `LadderDeckRecommendationPanel`，支持加载、成功、缓存、空数据、错误和复制反馈状态。

- [ ] 先写失败测试：显示模式、卡组名、职业、胜率、场次、更新时间；点击复制后调用桥接并显示“已复制”；复制失败显示错误。
- [ ] 运行 `npm test -- tests/ladderDeckRecommendationPanel.test.tsx`，确认测试先失败。
- [ ] 实现紧凑面板及与右侧一致的深蓝黑样式，卡牌列表内部滚动，底部复制按钮固定可见。
- [ ] 再次运行测试并确认通过。

### Task 3: 模式联动、窗口定位与安全桥接

**Files:**
- Create: `src/main/ladderDeckOverlayController.ts`
- Create: `src/main/ladderDeckOverlayBounds.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.cts`
- Modify: `src/renderer/stateInitialization.ts`
- Test: `tests/ladderDeckOverlayController.test.ts`
- Test: `tests/ladderDeckOverlayBounds.test.ts`

**Interfaces:**
- Consumes: tracker 的 `constructedScreenMode`、当前游戏状态、前台应用名以及 Task 1 服务。
- Produces: 独立左侧推荐窗、只允许复制已加载推荐代码的 IPC、模式切换刷新与生命周期控制。

- [ ] 先写失败测试：标准/狂野显示并切换；竞技场/未知模式/非炉石前台隐藏；恢复使用不抢焦点方式；左侧不足时隐藏；位置跟随炉石显示区域。
- [ ] 运行 `npm test -- tests/ladderDeckOverlayController.test.ts tests/ladderDeckOverlayBounds.test.ts`，确认测试先失败。
- [ ] 实现控制器、窗口边界计算、渲染初始化和剪贴板桥接；异步刷新必须防止旧模式结果覆盖新模式。
- [ ] 再次运行测试并确认通过。

### Task 4: 集成验收、打包与文档

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/backend.md`
- Modify: `docs/frontend.md`
- Modify: `docs/ux.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1-3 的完整功能。
- Produces: 可运行、可打包、已截图检查的最终应用。

- [ ] 运行新增定向测试并修复全部失败。
- [ ] 运行 `npm test`、`npm run typecheck`、`npm run build`，修复全部失败。
- [ ] 使用 QA 环境启动左右两个悬浮窗，截取标准与狂野状态；实际点击复制按钮并读取剪贴板确认完整代码。
- [ ] 用截图逐项检查位置、风格、文字、滚动、窄屏和错误状态；发现问题后修复并重新截图。
- [ ] 运行 `npm run package:mac`，确认 `.app` 与压缩包生成成功。
- [ ] 更新项目文档，记录真实数据来源、缓存规则、窗口职责和失败表现。

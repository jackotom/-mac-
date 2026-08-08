# Task 3 Report — v0.3.13

## 改动

- QA 三张竞技场候选补齐抽到影响和对套牌影响，覆盖正值、负值和零值。
- 发布验证强制要求 `arena-choice-overlay.png` 与对应 inspection JSON，并检查“抽到影响 / 对套牌影响 / 选取率 / 6+胜选取率”四个标签。
- `package.json`、`package-lock.json`、界面版本统一为 `0.3.13`。
- README、前端、交互、架构和发布说明写明真实统计口径、动态高胜门槛、旧缓存刷新和缺数据“暂无”；发布说明明确未声称 Apple 公证。
- 新增发布回归，锁定版本对齐、QA 三态示例和选牌发布证据。

## 验证

- `rtk npm test -- tests/releaseVerification.test.ts`：16/16 通过。
- `rtk npm test -- tests/arenaChoiceOverlayPanel.test.tsx tests/arenaChoiceOverlayUiRegression.test.tsx tests/arenaChoiceOverlayResilience.test.tsx tests/arenaChoiceRendererStateStability.test.tsx`：12/12 通过。
- `rtk npm run typecheck`：通过。
- `rtk npm run build`：通过。
- `rtk git diff --check`：通过。
- `rtk npm audit --omit=dev`：0 个漏洞。
- 独立审查后补强发布门槛：除四个标签外，还必须出现 QA 的正、负、零和百分比示例值，并锁定检查只作用于选牌悬浮窗场景。
- 首次打包截图发现主窗口旧样式覆盖悬浮条，实际变成 3+1；已把悬浮条容器和格子改为完全独立样式名，并新增防回归测试。
- 发布 inspection 现在记录三组四格的实际坐标和计算后网格；发布门槛强制三组都为 2×2 且不超过 62px。

## 风险与交接

- 未按任务边界运行耗时的 `verify:release`、未替换 `/Applications`、未推送。
- 现有 `outputs/release-verification/screenshots/arena-choice-overlay.png` 是旧三格证据；主控运行完整发布验证后必须重生成，并人工确认三列四格、不截字、不遮卡。
- Apple 公证未执行，也未在文档中声称已公证。

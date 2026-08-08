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

- 两轮完整 `verify:release` 已通过；第二轮为 121 个测试文件、993 项通过、1 项跳过，7/7 发布场景通过。
- 新截图和 inspection 已确认三张牌都是 2×2 四格、不截字、三列对齐；`/Applications/炉石记牌器.app` 已替换为 0.3.13 并成功启动。
- 分支仍待主控推送。
- Apple 公证未执行，也未在文档中声称已公证。

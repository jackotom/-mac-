# 国服天梯数据接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自动识别本机国服炉石版本，并让左侧推荐窗只消费同版本、可核验的国服天梯数据。

**Architecture:** 用独立模块读取本机炉石安装信息，输出完整版本与主补丁；推荐服务通过注入该模块获得版本，不再依赖手工环境变量。外部数据继续经过固定契约、严格校验和版本隔离缓存，界面展示版本、来源、更新时间及可操作的细分状态。

**Tech Stack:** Electron 33、React 18、TypeScript、Vitest、macOS plist/Battle.net 本机安装记录。

## Global Constraints

- 只读取本机安装信息，不读取游戏内存、不注入进程、不上传个人信息。
- 不把外服、旧版本或无法证明来源的数据标记成国服数据。
- 不提交 Git；当前目录不是 Git 仓库。
- 所有生产代码修改必须先有失败测试。
- 当前真实安装 `36.0.246003` 必须归一化为主补丁 `36.0`。

---

### Task 1: 本机炉石版本识别

**Files:**
- Create: `src/main/hearthstoneInstallation.ts`
- Test: `tests/hearthstoneInstallation.test.ts`

**Interfaces:**
- Produces: `detectHearthstoneInstallation(options?): Promise<HearthstoneInstallationResult>`。
- Success result contains `status: "detected"`, `fullVersion`, `patch`, `region: "CN"`, `appPath`, `source`。
- Failure result uses `status: "not-found" | "version-unreadable" | "region-unverified"` and a Chinese message.

- [ ] **Step 1:** 写测试，覆盖 `36.0.246003 -> 36.0`、`36.0.0.246003 -> 36.0`、默认路径、Battle.net 自定义路径、版本缺失和非国服证据。
- [ ] **Step 2:** 运行 `npm test -- tests/hearthstoneInstallation.test.ts --run`，确认因模块不存在而失败。
- [ ] **Step 3:** 实现只读识别器；plist 读取通过可注入文件读取和 plist 命令边界完成，Battle.net 记录仅用于寻找路径与交叉确认地区。
- [ ] **Step 4:** 重新运行该测试，确认全部通过。

### Task 2: 推荐数据契约、严格校验和版本缓存

**Files:**
- Modify: `src/shared/ladderDeckRecommendation.ts`
- Modify: `src/main/ladderDeckRecommendationService.ts`
- Modify: `tests/ladderDeckRecommendation.test.ts`
- Modify: `tests/ladderDeckRecommendationService.test.ts`

**Interfaces:**
- `LadderDeckRecommendationResult` 增加 `gameVersion` 和稳定错误码。
- 服务构造函数接受 `installationDetector`，不再要求 `HEARTHSTONE_CURRENT_PATCH`。
- 数据顶层必须包含 `schemaVersion: 1`, `region: "CN"`, `patch`, `generatedAt`, `source`, `decks`。

- [ ] **Step 1:** 写失败测试，覆盖自动版本、顶层国服证据、补丁不匹配、未来时间、过期数据、坏记录隔离、真实 deckstring 解码、跨版本缓存拒绝。
- [ ] **Step 2:** 运行两个推荐测试文件，确认新增断言失败且失败原因对应缺失行为。
- [ ] **Step 3:** 实现最小契约和校验；缓存按补丁与模式选择，原子写入，在线失败只允许同补丁有效缓存。
- [ ] **Step 4:** 重新运行两个推荐测试文件，确认全部通过。

### Task 3: 左侧窗口状态和真实版本展示

**Files:**
- Modify: `src/renderer/components/LadderDeckRecommendationPanel.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/ladderDeckRecommendationStyles.css`
- Modify: `tests/ladderDeckRecommendationPanel.test.tsx`

**Interfaces:**
- Panel receives `gameVersion`, structured unavailable result and optional retry callback。
- Normal state shows full version, source and update time。
- Failure state shows short title, one-line explanation and only actionable controls。

- [ ] **Step 1:** 写失败测试，覆盖版本展示、缓存更新时间、未找到安装、版本不可读、数据源未接入、网络失败、当前补丁无数据、校验失败和重新检测按钮。
- [ ] **Step 2:** 运行 `npm test -- tests/ladderDeckRecommendationPanel.test.tsx --run`，确认新增界面断言失败。
- [ ] **Step 3:** 实现状态映射与紧凑布局，同时修正关闭按钮和错误状态样式类。
- [ ] **Step 4:** 重新运行界面测试，确认全部通过。

### Task 4: 数据入口配置与整体集成

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.cts`
- Modify: `src/renderer/types.ts`
- Modify: `README.md`
- Modify: `docs/backend.md`
- Modify: `docs/frontend.md`

**Interfaces:**
- 主进程创建识别器与推荐服务，并通过现有 IPC 返回结构化结果。
- 数据入口只能是内置 HTTPS 白名单地址；没有经过验证的入口时返回 `source-unconfigured`，不展示示例卡组。

- [ ] **Step 1:** 写或更新 IPC/窗口测试，证明结构化结果完整传到渲染层。
- [ ] **Step 2:** 运行相关测试确认失败。
- [ ] **Step 3:** 完成 IPC、类型和文档接线；未确认网易稳定接口前保持来源未配置状态，不伪造在线数据。
- [ ] **Step 4:** 运行相关测试确认通过。

### Task 5: 主控验收与安装包验证

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1:** 运行 `npm run typecheck`。
- [ ] **Step 2:** 运行 `npm test -- --run`。
- [ ] **Step 3:** 运行 `npm run build`。
- [ ] **Step 4:** 用真实 `/Applications/Hearthstone/Hearthstone.app` 验证读到 `36.0.246003` 和 `36.0`。
- [ ] **Step 5:** 运行 `npm run package:mac-arm64`，执行 `codesign --verify --deep --strict outputs/炉石记牌器.app`。
- [ ] **Step 6:** 打开 QA 推荐窗口，目视检查正常、缓存和各失败状态；检查关闭、复制与重新检测。
- [ ] **Step 7:** 复查项目文档和长期记忆写入边界，只记录有长期价值的项目结构变化，不写秘密。

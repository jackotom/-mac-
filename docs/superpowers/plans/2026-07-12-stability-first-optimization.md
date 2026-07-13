# 炉石记牌器稳定性优先全面优化实施计划

> **执行方式：** 主控负责整合与最终验收；前端、后端、UI、测试、代码审查五个角色分工。项目不是 Git 仓库，本计划不包含提交步骤。

**目标：** 修复模式串台、日志竞态和识别组件问题，并完成安全、性能、界面与发布验收加固。

**方案：** 保留现有 Electron + React + TypeScript 架构，以小范围状态约束、异步串行化、运行边界校验和回归测试加固现有流程，不做整体重写。

**技术：** Electron、React、TypeScript、Vitest、Swift 本机识别组件、macOS codesign。

## 全局约束

- 只改与稳定性、安全、性能和错误体验直接相关的内容。
- 不新增大型依赖，不新增产品功能，不伪造国服数据。
- 代码注释保持英文。
- 错误必须明确，不使用静默兜底掩盖数据问题。
- 每项修改先补失败测试，再实现，再跑覆盖测试。
- 子控完成后由主控重新检查和运行验证。

## Task 1：修复竞技场与普通套牌串台

**文件：**
- 修改 `src/main/trackerService.ts`
- 修改 `tests/trackerService.test.ts`

- [ ] 增加“竞技场选牌/竞技场牌库期间 Decks.log 更新”的失败测试。
- [ ] 明确竞技场活动状态下收藏扫描只能更新缓存，不能预览普通套牌。
- [ ] 只有确认退出竞技场并连续识别到构筑选牌页后才允许切换。
- [ ] 运行 `npx vitest run tests/trackerService.test.ts`。

## Task 2：串行化日志追加处理与恢复临时错误

**文件：**
- 修改 `src/main/trackerService.ts`
- 修改 `tests/trackerService.test.ts`

- [ ] 增加同一路径连续 change、延迟读取和日志截断测试。
- [ ] 为每个日志路径建立处理队列，保证 offset 与事件应用严格串行。
- [ ] 暂时读取失败后保留可恢复状态；下一次成功读取恢复“监听中”。
- [ ] 验证暂停、dispose 和切换会话后旧队列不能写回状态。
- [ ] 运行 trackerService 全部测试。

## Task 3：统一开发版与打包版识别组件解析

**文件：**
- 修改 `src/main/arenaScreenRecognition.ts`
- 修改 `src/main/frontmostApp.ts`
- 修改 `tests/arenaScreenRecognition.test.ts`
- 修改或新增 `tests/frontmostApp.test.ts`

- [ ] 增加开发环境、打包环境、组件缺失和错误架构测试。
- [ ] 打包时只读 Resources，开发时只读项目 `native/bin`。
- [ ] 错误信息准确指出缺失组件。
- [ ] 实际运行开发版，确认不再出现“识别组件不可用”。

## Task 4：加固缓存、远程请求和数据更新

**文件：**
- 修改 `src/main/collectionDeckStore.ts`
- 修改 `src/main/collectionDeckService.ts`
- 修改 `src/main/cardDataService.ts`
- 修改 `src/main/arenaRatingService.ts`
- 修改对应测试文件

- [ ] 收藏套牌缓存改为临时文件后原子替换，并串行化写入。
- [ ] 并发扫描只允许最新结果覆盖缓存。
- [ ] 卡牌内存缓存允许显式刷新，不因首次加载永久冻结。
- [ ] 所有竞技场版本探测请求使用统一超时。
- [ ] 覆盖缓存损坏、断网、并发写入和超时测试。

## Task 5：Electron 安全边界

**文件：**
- 修改 `src/main/main.ts`
- 修改 `src/main/preload.cts`
- 修改 `index.html`
- 新增或修改 IPC 与窗口测试

- [ ] 为所有主进程入口校验调用窗口与页面来源。
- [ ] 限制页面跳转和新窗口，外部链接只能通过白名单。
- [ ] 明确开启上下文隔离和沙箱，保持 Node 不进入界面层。
- [ ] 增加严格内容安全策略，保留所需图片来源。
- [ ] 缩小展示型小窗能调用的能力范围。
- [ ] 运行全部 IPC、preload 和窗口测试。

## Task 6：前端状态与交互稳定性

**文件：**
- 修改 `src/renderer/App.tsx`
- 按需要新增 `src/renderer/hooks/` 下的小型 hooks
- 修改 `src/renderer/components/CardLibraryPanel.tsx`
- 修改对应测试

- [ ] 校正实时错误、初始化错误和普通提示的显示优先级。
- [ ] 修复卡牌搜索一次输入触发两次读取的问题。
- [ ] 加同步操作锁，避免双击发出重复高影响操作。
- [ ] 卡牌库更新时保留旧结果并允许继续输入。
- [ ] 对跨边界状态增加最小运行时校验，非法数据拒绝进入 React。
- [ ] 修复 React 测试中的异步更新警告。

## Task 7：窗口尺寸、可读性和后台刷新

**文件：**
- 修改 `src/main/main.ts`
- 修改 `src/renderer/components/TopBar.tsx`
- 修改 `src/renderer/components/BoardAttackOverlay.tsx`
- 修改相关 CSS 与测试

- [ ] 普通记牌小窗最小宽度与真实布局一致。
- [ ] 对手窗展开态不能缩成折叠尺寸，保存的异常尺寸自动修正。
- [ ] 为窄窗图标补充可见提示和键盘焦点。
- [ ] 提高竞技场数据条和关键按钮的最低可读尺寸。
- [ ] 未读到场攻时显示未知，不伪装成真实 0。
- [ ] 隐藏窗口允许节流或停止无用刷新，可见窗口保持实时。
- [ ] 删除与 Mac 原生窗口控制重复的自制最小化入口。

## Task 8：测试角色补齐发布验收闭环

**文件：**
- 新增 `scripts/verify-release.sh`
- 修改 `package.json`
- 修改 `docs/commercial-acceptance.md`
- 修改或新增 QA 测试

- [ ] 一键运行完整测试、类型检查和正式构建。
- [ ] 回放普通对局、自动匹配、竞技场和模式切换日志。
- [ ] 自动截图主窗口和所有悬浮窗并保存检查数据。
- [ ] 检查本机组件、应用签名、录屏说明、架构与安装包启动。
- [ ] 记录冷启动、空闲监听和高频日志下的基线数据。

## Task 9：代码审查、打回与最终验收

- [ ] 代码审查角色检查竞态、越权入口、静默失败和过度复杂。
- [ ] 主控逐项核对设计稿与商业验收文档。
- [ ] 修复所有严重和重要问题后重新运行完整验收。
- [ ] 实际打开打包应用，检查当前真实炉石日志和所有窗口。
- [ ] 完成项目文档与记忆复利检查，只记录有长期价值的项目事实或跨项目踩坑。

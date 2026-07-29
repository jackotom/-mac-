# 炉石记牌器 v0.2.9 卡牌生命周期升级计划

> 状态：已重写，等待实施
> 当前版本：`0.2.8`
> 目标版本：`0.2.9`
> 发布范围：源码上传 GitHub；不重新打包，不创建安装包 Release

## 1. 完成标准

以下条件全部满足才算完成：

1. 我方和对手都按当前位置显示：牌库、手牌、场上、奥秘、墓地、移除。
2. “疑似烧毁”和“已使用”是事件历史，不再混进当前位置。
3. 满手时从牌库进入墓地：
   - 牌库立即扣除。
   - 墓地当前数量增加。
   - 疑似烧毁历史增加。
   - 已使用历史不增加。
4. 普通打出：
   - 已使用历史增加。
   - 不进入疑似烧毁。
   - 同一实体回手后再次打出，保留两次独立记录。
5. 身份未知的打出或烧毁先保留事件；日志晚揭示后只补牌名和详情，不重复计数。
6. 每次使用都有独立 `usageId`；古神实际结果绑定 `usageId`，不是绑定牌名或卡牌编号。
7. 古神支持：
   - 普通 5 张。
   - 双倍 10 张或真实更多张。
   - 重复法术不合并。
   - 同一张古神多次使用分别展示。
   - 古神套古神保留层级和顺序。
8. 理论候选池与本次实际结果分开：
   - 普通悬停不加载理论池。
   - 固定详情可展开理论池，每次 12 张。
   - 本次实际结果始终完整展示。
9. 我方窗口真实支持 `100×200` 和 `100×900`；对手窗口真实支持 `250×170`。
10. 新奥秘、日志更新、窗口恢复都不抢炉石焦点。
11. 每个任务结束时，相关测试、`typecheck`、`build` 都通过；不允许靠后续任务修复前一任务。
12. 全量自动验收、真实 Electron 尺寸验收、控制台检查全部通过后，版本才升到 `0.2.9`。
13. 上传前复查远端、分支和暂存内容；只上传源码、测试和文档。

---

## 2. 范围边界

### 本次必须完成

- 卡牌当前位置与事件历史分离。
- 满手烧毁识别、扣牌、历史记录和晚揭示。
- 普通使用、回手再使用、同名多次使用。
- 古神每次使用对应的真实结果。
- 两个实战窗和主窗口读取新状态。
- 卡牌详情的理论池与实际结果交互。
- 真实小窗尺寸、不抢焦点、滚动和折叠。
- 版本 `0.2.9`、修复说明、GitHub 源码上传。

### 本次明确不做

- 不建立跨局永久时间线。
- 不猜测没有日志证据的牌来源。
- 不把普通“牌库进入墓地”一律称为烧毁。
- 不重写整个日志解析器。
- 不声称修复 UTF-8 日志分块；现有追加读取已经保留残余字节，启动首次读取的半字节问题另开任务，不夹带进本次发布说明。
- 不重新打包 `.app` 或 `.zip`。
- 不运行 `npm run package:mac-arm64`。
- 不运行 `npm run verify:release`。

---

## 3. 唯一数据设计

### 3.1 唯一事实来源

`TrackerEngine` 继续是局内唯一事实来源。

禁止新增第二份可修改的“已使用卡牌数组”。现有：

```ts
friendlyCardsUsedThisGame
opponentCardsUsedThisGame
```

必须被新的使用记录替换，不得和新记录并存。

关系牌、决胜时刻、法术回放等功能需要 `CardInfo[]` 时，从使用记录按当前牌库资料动态派生：

```ts
resolveKnownCardsFromUses(records): CardInfo[]
```

派生结果不保存为第二份局内状态。

### 3.2 内部使用记录

```ts
interface RecordedCardUse {
  readonly usageId: string;
  readonly sequence: number;
  readonly entityId: string;
  readonly side: "friendly" | "opponent";
  readonly cardId?: string;
  readonly name?: string;
}
```

规则：

- `PLAY` 动作一旦确认敌我归属就记录，即使查不到 `CardInfo`。
- `usageId = ${gameKey}:use:${sequence}`，只用局内递增序号，不用时间戳生成身份。
- 同一实体未回到手牌前，重复日志只记录一次。
- 实体真实回到手牌后清除该实体的“已记录出牌”标记，再次打出生成新 `usageId`。
- 古神自动施放的子法术不是玩家打出，不进入“已使用”；它们只进入古神结果树。

### 3.3 内部烧毁记录

```ts
interface RecordedBurn {
  readonly burnId: string;
  readonly sequence: number;
  readonly entityId: string;
  readonly side: "friendly" | "opponent";
  readonly cardId?: string;
  readonly name?: string;
  readonly confidence: "inferred";
  readonly transitionFingerprint: string;
}
```

只有同时满足以下条件才追加：

```text
fromZone = DECK
toZone = GRAVEYARD
迁移前该玩家可计数手牌数量 = 10
同一 transitionFingerprint 尚未记录
```

界面文字固定为“疑似烧毁”，不能显示“已烧毁”。

### 3.4 可计数卡牌

当前位置统计和满手判断必须共用：

```ts
isCountableCardEntity(entity): boolean
```

规则：

- 只统计 `DECK/HAND/PLAY/SECRET/GRAVEYARD/REMOVEDFROMGAME`。
- 已知是 `HERO/HERO_POWER/ENCHANTMENT/PLAYER/GAME` 的实体排除。
- 附着物排除。
- 身份未知但位于牌库或手牌、且 controller 已确认的实体保留计数。
- `SETASIDE/UNKNOWN` 不展示为当前位置，也不伪装成历史。

烧毁判断必须在 `mergeEntity()` 改变区域之前读取手牌数量。

### 3.5 古神结果绑定

现有 `CardOutcomeSection/CardOutcomeNode` 继续作为唯一结果树，不新建第二棵树。

内部索引改为：

```ts
Map<string, RecordedCardOutcome[]> // key = usageId
```

绑定规则：

1. 保持当前真实解析顺序：同一条 PLAY 日志先建立尚未绑定的根结果 frame。
2. 随后的 `action-boundary/start/play` 创建 `RecordedCardUse`，再按同一 side、同一源实体把 `usageId` 绑定到最近的待领取根 frame。
3. 子法术和嵌套古神继承根 `usageId`。
4. 同一 `usageId` 下出现多个根结果块时按日志顺序拼接，双倍施放显示为同一次使用的 10 张或真实数量。
5. 不同 `usageId` 绝不共享结果。
6. 通用卡牌详情可以按使用顺序显示该卡整局多次结果；“已使用”某一行的详情只能显示该行 `usageId` 的结果。

### 3.6 公开状态

```ts
export type PublicCardZone =
  | "deck"
  | "hand"
  | "play"
  | "secret"
  | "graveyard"
  | "removed";

export type PublicTrackingStatus = "known" | "partial" | "unknown";
export type PublicTrackingConfidence = "confirmed" | "inferred";

export interface PublicKnownCard {
  readonly cardKey: string;
  readonly cardId?: string;
  readonly name: string;
  readonly count: number;
}

export interface PublicCardZoneGroup {
  readonly status: PublicTrackingStatus;
  readonly knownCount: number;
  readonly totalCount?: number;
  readonly cards: readonly PublicKnownCard[];
}

export interface PublicCardHistoryItem {
  readonly id: string;
  readonly sequence: number;
  readonly entityId: string;
  readonly card?: Omit<PublicKnownCard, "count">;
  readonly confidence: PublicTrackingConfidence;
  readonly outcomeSections?: readonly CardOutcomeSection[];
}

export interface PublicCardHistoryGroup {
  readonly totalCount: number;
  readonly items: readonly PublicCardHistoryItem[];
  readonly truncated: boolean;
}

export interface PublicPlayerCardTracking {
  readonly current: Readonly<Record<PublicCardZone, PublicCardZoneGroup>>;
  readonly burned: PublicCardHistoryGroup;
  readonly used: PublicCardHistoryGroup;
}

export interface PublicCardTracking {
  readonly schemaVersion: 1;
  readonly gameKey: string;
  readonly friendly: PublicPlayerCardTracking;
  readonly opponent: PublicPlayerCardTracking;
  readonly opponentSecretSlots: readonly OpponentSecretSlot[];
  readonly detailsByCardKey: Readonly<Record<string, CardDetails>>;
}
```

关键约束：

- 未知历史使用 `card?: undefined`，不伪造名为“未公开”的卡牌。
- 当前区域的 `cards` 只包含身份已知卡；未知数量只进入 `totalCount`。
- `knownCount` 必须等于 `cards[].count` 之和。
- `known`：`totalCount === knownCount`。
- `partial`：`totalCount > knownCount`。
- `unknown`：`totalCount === undefined`。
- 历史最多公开最近 30 条，最新在前；`totalCount` 保留整局真实次数。
- 内部 uses 和 burns 保留整局完整记录，不能按公开 30 条上限截断。
- `used.items[].id === usageId`。
- `burned.items[].id === burnId`。
- `detailsByCardKey` 每种卡只保存一次不带实际结果的基础详情和理论池。
- 每次使用的实际结果只放在对应历史项 `outcomeSections`。
- renderer 展示历史详情时合并基础详情和该次实际结果；禁止把完整理论池复制到每条历史。

### 3.7 奥秘唯一语义

每次生成公开状态只调用一次：

```ts
const secretSlots = secretTracker.getSlots();
```

然后同时生成：

```text
opponentSecretSlots = secretSlots
opponent.current.secret.totalCount = secretSlots.length
```

未揭示奥秘：

```text
knownCount = 0
cards = []
```

候选牌只存在 `opponentSecretSlots[].candidates`。一个槽位有五个候选，界面仍显示“当前 1 个奥秘”，不能显示成五张真实奥秘。

---

## 4. 实施任务

## Task 0：基线与工作区保护

**只检查，不改代码。**

运行：

```bash
rtk git status --short
rtk git branch --show-current
rtk git remote -v
rtk npm test
rtk npm run typecheck
rtk npm run build
```

记录：

- 当前分支。
- `origin` 地址。
- 用户已有修改。
- 测试数量和失败项。
- 当前版本必须为 `0.2.8`。

规则：

- 不清理、不覆盖用户修改。
- 不使用 `git add .`、`git add -A` 或 `git add tests`。
- 基线失败先判断是否与本次功能相关；相关则纳入首个修复任务，不相关则保留原始证据，不能冒充本次修好。

### 验收

完成条件：工作区范围和基线结果明确。

### 提交计划文档

基线通过后先只提交本计划，避免实施期间一直保留未跟踪文件：

```bash
rtk git add docs/superpowers/plans/2026-07-29-card-lifecycle-v0.2.9.md
rtk git diff --cached --check
rtk git commit -m "docs: plan card lifecycle v0.2.9"
```

---

## Task 1：增加迁移契约、严格校验和合法测试工厂

**Files**

- Modify: `src/shared/types.ts`
- Modify: `src/renderer/runtimeValidation.ts`
- Create: `tests/fixtures/publicTrackerState.ts`
- Create: `tests/runtimeValidation.test.ts`
- Modify: `tests/frontendStability.test.ts`

### Step 1：迁移期契约

先增加：

```ts
readonly cardTracking?: PublicCardTracking;
```

本任务保持可选，保证旧状态仍可读取。最终迁移任务再改为必填。

提供：

```ts
createEmptyCardTracking(gameKey: string): PublicCardTracking
createLegacyPublicTrackerState(...): PublicTrackerState
createPublicTrackerState(...): PublicTrackerState
```

规则：

- 正常工厂永远包含合法 `cardTracking`。
- 只有显式命名的 legacy 工厂允许缺失。
- 正常工厂不得接受 `cardTracking: undefined` 覆盖。
- 每次创建返回全新数组和对象。

### Step 2：运行校验

校验：

- `schemaVersion === 1`。
- `gameKey` 非空。
- 所有数量是非负整数。
- 已知卡数量是正整数。
- `knownCount` 等于已知卡数量之和。
- `known/partial/unknown` 满足第 3.6 节约束。
- 历史 ID 唯一、sequence 是非负整数。
- `items.length <= 30`。
- `items.length <= totalCount`。
- `truncated === (totalCount > items.length)`。
- 奥秘 `totalCount === opponentSecretSlots.length`。
- 结果树最大深度 16、总节点数 512；非法外部状态直接拒绝，防止 renderer 被畸形数据拖死。

### Step 3：失败测试

至少覆盖：

- `known` 数量不相等。
- `partial` 没有总数。
- `unknown` 带总数。
- `knownCount` 与卡牌数量之和不一致。
- 历史重复 ID。
- 截断标志错误。
- 一个奥秘槽被错误算成五张奥秘。
- 结果树深度或节点数超限。
- 两次创建状态不共享数组。
- legacy 状态可在迁移期读取；正常状态始终完整。

### 验收

```bash
rtk npm test -- tests/runtimeValidation.test.ts tests/frontendStability.test.ts
rtk npm run typecheck
rtk npm run build
```

### 提交

仅暂存本任务文件：

```bash
rtk git add src/shared/types.ts src/renderer/runtimeValidation.ts tests/fixtures/publicTrackerState.ts tests/runtimeValidation.test.ts tests/frontendStability.test.ts
rtk git diff --cached --check
rtk git commit -m "feat: define card lifecycle contract"
```

---

## Task 2：建立唯一使用历史和可信烧毁历史

**Files**

- Modify: `src/shared/trackerEngine.ts`
- Modify: `tests/trackerEngine.test.ts`

### Step 1：先写失败测试

必须覆盖：

1. 普通友方卡使用一次，只增加友方 used。
2. 普通对手卡使用一次，只增加对手 used。
3. 查不到卡牌数据库的 `PLAY` 仍生成隐藏 used 项。
4. 隐藏 used 项晚揭示后补牌名，不新增第二项。
5. 同一实体重复日志只记一次。
6. 同一实体回手再使用生成两个不同 `usageId`。
7. 古神自动施放子法术不进入 used。
8. 十张可计数手牌时，牌库进入墓地：
   - 牌库减少 1。
   - 墓地增加 1。
   - burned 增加 1。
   - used 不变。
9. 九张手牌时同样迁移不标 burned。
10. 九张牌加一个附属实体不能误判十张。
11. 隐藏 burned 晚揭示只补身份。
12. 相同日志动作重复出现不重复 burned。
13. 真正洗回牌库后再次烧毁生成第二条记录。
14. `resetForGame()`、`resetAfterGame()`、`clearArenaDeck()` 分别清空 uses、burns、结果索引和去重状态。
15. 重复 `CREATE_GAME` 不重复更换 `gameKey`。

### Step 2：替换旧使用数组

删除：

```ts
friendlyCardsUsedThisGame
opponentCardsUsedThisGame
```

增加：

```ts
private cardUses: RecordedCardUse[] = [];
private burns: RecordedBurn[] = [];
private activeUsageIdByEntity = new Map<string, string>();
```

公开时按 `side` 过滤同一个数组。关系牌与“本局已施放法术”改为动态读取 `resolveKnownCardsFromUses()`。

### Step 3：记录未知使用

`action-boundary` 的 `play/start` 分支不再要求 `info` 存在。

只要：

```text
gameActive
entityId 存在
敌我 controller 已确认
```

就创建使用记录。当前已知身份写入记录；缺失身份等以后投影时从实体表补齐。

当前解析器先建立 PLAY block frame、后发出 action boundary。本任务只保证 action 创建可观察的 use；Task 3 再按真实顺序把新 `usageId` 绑定回待领取 frame。

### Step 4：可靠烧毁

在区域合并前：

1. 用 `isCountableCardEntity()` 计算迁移前手牌数量。
2. 计算标准化 `transitionFingerprint`，包含日志时间、实体、敌我、起止区域；不同日志前缀不影响指纹。
3. 满足第 3.3 节时追加疑似烧毁。
4. 继续走现有牌库扣除和区域合并，不为烧毁另写第二套扣牌逻辑。

如果日志缺少可提取时间：

- 仍使用当前实体区域防止紧邻重复。
- 不把无时间动作永久按实体去重，避免阻止真实再次烧毁。

### Step 5：统一清理

`clearMatchCardHistory()` 必须清理：

- uses。
- burns。
- 使用实体去重。
- 烧毁动作指纹。
- 古神使用绑定。
- 古神结果。
- 局内 sequence。

只有确认进入真正新局时生成新 `gameKey`。

- `resetForGame()`：清理局内状态后递增全局游戏序号并生成新 `gameKey`。
- `resetAfterGame()`、`clearArenaDeck()`：清理后公开 `gameKey = "no-game"`。
- 全局游戏序号不能在局间清零。

### Step 6：提供可观察的最小公开投影

本任务必须让测试通过公开接口观察结果，禁止测试私有数组。

在 `getState()` 增加：

```ts
cardTracking: this.buildCardTracking()
```

本任务的 `buildCardTracking()` 必须已经公开：

- 六个当前位置分组。
- used。
- burned。
- `gameKey`。
- 一次读取的奥秘槽位和对应当前数量。
- 空的 `detailsByCardKey`。

used 和 burned 都从完整内部数组按 side 过滤，再公开最近 30 条。Task 3 增加每次使用结果，Task 4 再增加基础详情字典和体积验收。

Task 2、Task 3 的测试统一从：

```ts
engine.getState().cardTracking
```

断言，不读取 private 字段。

### 验收

```bash
rtk npm test -- tests/trackerEngine.test.ts
rtk npm run typecheck
rtk npm run build
```

### 提交

```bash
rtk git add src/shared/trackerEngine.ts tests/trackerEngine.test.ts
rtk git diff --cached --check
rtk git commit -m "fix: track card uses and inferred burns once"
```

---

## Task 3：把古神结果绑定到具体使用

**Files**

- Modify: `src/shared/trackerEngine.ts`
- Modify: `tests/trackerEngine.test.ts`
- Modify: `tests/cardDetailBody.test.tsx`
- Modify: `tests/cardDetailCardPool.test.tsx`

### Step 1：失败测试

使用真实 `BLOCK_START/BLOCK_END/FULL_ENTITY` 形态覆盖：

1. 一次古神使用得到五张有序结果。
2. 双倍效果得到十张或日志真实数量，仍属于一个 `usageId`。
3. 重复法术保留重复项。
4. 同一古神实体回手后再次使用：
   - 两条 used。
   - 每条只显示自己的结果。
5. 两张同名古神分别使用，结果不串。
6. 古神套古神保留父子层级。
7. GameState 与 PowerTaskList 重复块不重复。
8. 对手结果不进入友方使用。
9. 普通法术 used 详情没有伪造的空古神结果。

### Step 2：改变结果索引

禁止继续以 `cardId` 作为唯一结果索引。

绑定时序固定为：

1. 根 frame 创建和配置时允许 `usageId` 为空，不查尚未创建的 use。
2. `action-boundary/start/play` 创建或取得 use。
3. 该 action 按 side 和 source entity 领取最近待绑定的根 frame，把 `usageId` 写回。
4. 后续子 frame 继承根 `usageId`。
5. 完成时只有已绑定 frame 才写入 `outcomesByUsageId`；孤立结果不冒充玩家本次使用。

同一使用出现多个 capture：

- 按完成 sequence 排序。
- 对外合并成一个“本次实际施放”区。
- cards 按日志顺序拼接。
- 子节点保持原树，不拍平嵌套。

### Step 3：两种详情

提供两个私有入口：

```ts
buildCardDetails(card, side: "friendly" | "opponent"): CardDetails
buildCardOutcomeSectionsForUsage(usageId): readonly CardOutcomeSection[]
```

- 第一种用于普通卡牌详情，只聚合指定 side 的该卡整局多次使用结果，敌我不能混合。
- 第二种供公开 used 某一行填写 `outcomeSections`，只返回该 `usageId` 的结果；side 从对应 use 记录确定。
- 理论候选池仍来自现有卡牌数据库。
- 实际结果仍使用现有 `CardOutcomeSection/CardOutcomeNode`。

### 验收

```bash
rtk npm test -- tests/trackerEngine.test.ts tests/cardDetailBody.test.tsx tests/cardDetailCardPool.test.tsx
rtk npm run typecheck
rtk npm run build
```

### 提交

```bash
rtk git add src/shared/trackerEngine.ts tests/trackerEngine.test.ts tests/cardDetailBody.test.tsx tests/cardDetailCardPool.test.tsx
rtk git diff --cached --check
rtk git commit -m "fix: bind random spell outcomes to each use"
```

---

## Task 4：补齐公开详情索引并限制状态体积

**Files**

- Modify: `src/shared/trackerEngine.ts`
- Modify: `tests/trackerEngine.test.ts`
- Create: `tests/cardTrackingPayload.test.ts`

### Step 1：复核 Task 2 已有当前位置

Task 2 已建立公开投影。本任务补强并锁死以下规则：

- 我方牌库：现有 `deckRows.remaining`。
- 其他当前位置：实体当前区域 + `isCountableCardEntity()`。
- 对手未知牌：只增加总数，不创建假牌。
- `SETASIDE/UNKNOWN` 不进入六个区域。
- burned/used 只来自动作历史，不从墓地反推。

### Step 2：历史

- 最近 30 条，最新在前。
- `totalCount` 是整局次数。
- `truncated` 准确。
- 公开时按 `entityId` 动态补身份。
- 记录时已有身份优先；只补缺失字段。
- 每个 used 项只带自己的 `outcomeSections`。

### Step 3：详情去重

`detailsByCardKey`：

- 每种已知卡只存一次基础详情。
- 基础详情删除 `cardOutcomeSections`。
- 理论候选池只在字典中出现一次。
- 历史项不复制完整 `CardDetails`。

renderer 后续使用：

```ts
mergeTrackingDetails(
  detailsByCardKey[item.card.cardKey],
  item.outcomeSections
)
```

### Step 4：奥秘

一次调用 `secretTracker.getSlots()`，同时生成候选和当前槽位数量。

测试：

- 一槽五候选仍是当前 1。
- 零槽是 `known 0`。
- 候选只出现一次。

### Step 5：状态体积测试

代表性状态：

- 30 次同一古神使用。
- 每次十张结果。
- 理论池至少 100 张。

断言：

- 理论池中指定卡牌编号在序列化状态只出现一次。
- 每条 history 只有本次结果。
- `JSON.stringify(state).length < 500_000`。

该阈值只防明显复制爆炸；若真实资料超过阈值，先优化结构，不得直接抬高阈值。

### 验收

```bash
rtk npm test -- tests/trackerEngine.test.ts tests/cardTrackingPayload.test.ts
rtk npm run typecheck
rtk npm run build
```

### 提交

```bash
rtk git add src/shared/trackerEngine.ts tests/trackerEngine.test.ts tests/cardTrackingPayload.test.ts
rtk git diff --cached --check
rtk git commit -m "feat: publish compact card lifecycle state"
```

---

## Task 5：建立唯一 renderer 映射

**Files**

- Create: `src/renderer/cardTrackingView.ts`
- Modify: `src/renderer/types.ts`
- Modify: `src/renderer/overlayView.ts`
- Modify: `src/renderer/App.tsx`
- Create: `tests/cardTrackingView.test.ts`
- Modify: `tests/overlayView.test.ts`
- Modify: `tests/overlayViewDataIntegrity.test.tsx`
- Modify: `tests/appTrackerOverlayMinimalApi.test.tsx`

### Step 1：独立历史类型

历史禁止复用牌名必填的 `OverlayCardItem`：

```ts
export interface OverlayHistoryItem {
  readonly id: string;
  readonly sequence: number;
  readonly displayName?: string;
  readonly hidden: boolean;
  readonly confidence: PublicTrackingConfidence;
  readonly details?: CardDetails;
}
```

未知历史：

```text
hidden = true
displayName = undefined
```

界面可以显示“身份未公开”，但不能创建一张名称为“未公开”的假卡。

### Step 2：纯映射

```ts
toCardTrackingView(
  tracking: PublicCardTracking,
  side: "friendly" | "opponent",
  options: { showSecretCandidates: boolean }
): OverlayCardTrackingView
```

规则：

- 所有区域和历史只从 `cardTracking` 读取。
- 当前卡牌映射成 `OverlayCardItem`。
- 历史映射成 `OverlayHistoryItem`。
- 同名事件按历史 ID 保留。
- 未知显示 `?`。
- 部分已知显示 `≥N`；对手奥秘单独显示“当前 N”。
- 历史截断显示“最近 N / 共 M”。
- 关闭奥秘预测只隐藏候选，不隐藏槽位和数量。
- 缺少迁移期 `cardTracking` 时显示“生命周期数据未就绪”，禁止回读旧“其他”猜区域。

### Step 3：立即补 App 初始状态

本任务就补齐：

- `demoState`。
- `qaOpponentOverlayState`。
- App 内其他 `PublicTrackerState` 常量。

不能拖到最终迁移，否则新界面首次渲染会空白。

### 失败测试

- 隐藏历史有次数、无假卡名。
- 同名两次使用保留两项。
- 一次使用只合并自己的实际结果。
- 理论池从 `detailsByCardKey` 合并，不在历史重复。
- 奥秘候选开关关闭后数量保留。
- 缺少新状态显示未就绪，不读旧字段。

### 验收

```bash
rtk npm test -- tests/cardTrackingView.test.ts tests/overlayView.test.ts tests/overlayViewDataIntegrity.test.tsx tests/appTrackerOverlayMinimalApi.test.tsx
rtk npm run typecheck
rtk npm run build
```

### 提交

```bash
rtk git add src/renderer/cardTrackingView.ts src/renderer/types.ts src/renderer/overlayView.ts src/renderer/App.tsx tests/cardTrackingView.test.ts tests/overlayView.test.ts tests/overlayViewDataIntegrity.test.tsx tests/appTrackerOverlayMinimalApi.test.tsx
rtk git diff --cached --check
rtk git commit -m "feat: map card lifecycle for renderer"
```

---

## Task 6：真实支持三个窗口尺寸和新分组

**Files**

- Modify: `src/main/overlayWindowBounds.ts`
- Modify: `src/main/main.ts`
- Modify: `tests/overlayWindowBounds.test.ts`
- Create: `src/renderer/cardTrackingLayout.ts`
- Create: `tests/cardTrackingLayout.test.ts`
- Create: `src/renderer/components/CardTrackingGroups.tsx`
- Modify: `src/renderer/components/OverlayPanel.tsx`
- Modify: `src/renderer/components/OpponentOverlayPanel.tsx`
- Modify: `src/renderer/overlayStyles.css`
- Modify: `src/renderer/opponentOverlayStyles.css`
- Modify: `tests/overlayPanel.test.tsx`
- Modify: `tests/opponentOverlayPanel.test.tsx`

### Step 1：先修真实窗口

我方：

- 默认仍为 `100×900`。
- 最小改为 `100×200`。
- `normalizeOverlayWindowBounds()` 使用 `minWidth: 100, minHeight: 200`。
- `BrowserWindow` 创建后最小尺寸为 `100×200`。
- 保存和恢复测试同时覆盖 `100×200`、`100×900`。
- 用户已有合法高度不被重置。

对手：

- 默认 `250×170`。
- 最小继续 `100×150`。

### Step 2：布局状态

```ts
type TrackingLayoutMode = "short" | "tall" | "opponent";
type TrackingPage = "current" | "history";
type TrackingGroupKey = PublicCardZone | "burned" | "used";
type SelectionOrigin = "system" | "user";
```

`ResizeObserver`：

- 高度 `1..399`：short。
- 高度 `>=400`：tall。
- 高度 0 忽略，首次用 `window.innerHeight`。
- 对手固定 opponent。

根节点公开：

```text
data-layout-mode
data-tracking-page
data-group-key
data-expanded
data-scroll-owner="card-tracking-main"
```

### Step 3：页面和折叠

当前位置：

```text
牌库
手牌
场上
奥秘
墓地
移除
```

历史：

```text
疑似烧毁
已使用
```

规则：

- short：当前位置和历史页都严格只展开一个组。
- tall：当前位置默认 deck + hand；历史默认 burned + used。
- 同局普通状态更新不重置选择。
- 新 `gameKey` 恢复系统默认。
- 用户点页面或分组后标记 `origin=user`。
- system 状态允许新奥秘提升到 secret。
- user 状态只更新数量和徽标，禁止强制跳页。
- tall 切 short 保留最近操作组，只留下一个。
- short 切 tall 保留用户选择，不偷偷补开其他组。

### Step 4：对手默认优先级

纯函数：

```ts
resolveOpponentDefault(view): {
  page: TrackingPage;
  expanded: ReadonlySet<TrackingGroupKey>;
}
```

顺序：

1. 有奥秘槽：current + secret。
2. 有已知手牌：current + hand。
3. 有未公开手牌：current + hand。
4. 牌库有牌或未知：current + deck。
5. 有历史：history；burned 优先，否则 used。
6. 全空：current + deck。

错误状态不进 resolver，Panel 直接短路显示错误。

未知手牌只显示一行：

```text
未公开 ×N
```

不能创建 N 张假卡。

### Step 5：尺寸结构

`100×200`：

- 工具栏 24px。
- 摘要 26px。
- 底栏 24px。
- 主内容占剩余空间。
- 当前或历史只展开一组。

`100×900`：

- 同样固定工具栏、摘要、底栏。
- 主内容独立滚动。
- 默认 deck + hand。

`250×170`：

- 工具栏 24px。
- 摘要 26px。
- 底栏 24px。
- 主内容占剩余空间。
- 错误时只显示工具栏和错误，不显示空分组。

外壳不能滚动。唯一指定滚动宿主是主内容；内容不足时允许实际滚动量为 0。

### 失败测试

- 页面不存在“其他”。
- short 当前页和历史页都只展开一个。
- tall 默认 deck + hand。
- 对手优先级六条全部命中。
- pristine 收到首个奥秘自动切 secret。
- 用户选 hand/history 后收到奥秘不跳页。
- 新 `gameKey` 恢复默认。
- 一槽五候选只显示当前 1。
- 关闭候选开关仍保留奥秘数量。

### 验收

```bash
rtk npm test -- tests/overlayWindowBounds.test.ts tests/cardTrackingLayout.test.ts tests/overlayPanel.test.tsx tests/opponentOverlayPanel.test.tsx
rtk npm run typecheck
rtk npm run build
```

### 提交

```bash
rtk git add src/main/overlayWindowBounds.ts src/main/main.ts tests/overlayWindowBounds.test.ts src/renderer/cardTrackingLayout.ts tests/cardTrackingLayout.test.ts src/renderer/components/CardTrackingGroups.tsx src/renderer/components/OverlayPanel.tsx src/renderer/components/OpponentOverlayPanel.tsx src/renderer/overlayStyles.css src/renderer/opponentOverlayStyles.css tests/overlayPanel.test.tsx tests/opponentOverlayPanel.test.tsx
rtk git diff --cached --check
rtk git commit -m "feat: show card lifecycle in real overlay sizes"
```

---

## Task 7：修正详情交互、主窗口假数据和自动奥秘焦点

**Files**

- Modify: `src/renderer/components/CardDetailBody.tsx`
- Modify: `src/renderer/components/CardHoverPreview.tsx`
- Modify: `src/renderer/components/CardLibraryPanel.tsx`
- Modify: `src/renderer/components/DeckPanel.tsx`
- Modify: `src/renderer/components/OpponentPanel.tsx`
- Modify: `src/renderer/components/ArenaPanel.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/cardHoverStyles.css`
- Modify: `src/renderer/dashboardView.ts`
- Create: `src/main/opponentSecretOverlayPresenter.ts`
- Modify: `src/main/main.ts`
- Modify: `tests/cardDetailBody.test.tsx`
- Modify: `tests/cardDetailCardPool.test.tsx`
- Modify: `tests/cardHoverPreview.test.tsx`
- Modify: `tests/cardPreviewWindowIsolation.test.tsx`
- Modify: `tests/cardPreviewDelivery.test.ts`
- Modify: `tests/dashboardView.test.ts`
- Modify: `tests/homeDashboard.test.tsx`
- Create: `tests/opponentSecretOverlayPresenter.test.ts`
- Modify: `tests/opponentOverlayWindowController.test.ts`
- Modify: `tests/automaticOverlayController.test.ts`
- Modify: `tests/windowExperience.test.ts`

### Step 1：详情只有两个合法模式

```ts
interface CardDetailBodyProps {
  readonly details?: CardDetails;
  readonly className?: string;
  readonly mode: "summary" | "interactive";
}
```

`summary`：

- 不渲染理论候选池。
- 不渲染继续按钮。
- 本次实际结果完整、只读。

`interactive`：

- 理论池标题默认折叠。
- 展开后首批 12 张。
- 每次继续显示 12 张。
- 实际结果默认展开，不受 12 张限制。
- 子结果树没有独立滚动条。

所有调用点必须显式传 mode：

- 普通 hover：summary。
- 固定外部预览：interactive。
- 主窗口固定内嵌预览：interactive。
- 卡牌数据库、牌库和对手专用详情面板：interactive。

### Step 2：两条真实固定路径

内嵌预览：

- 只有当前目标激活时处理 `Alt+Q`。
- 普通是 `role=tooltip`、不可点击。
- 固定后是 `role=dialog`、可点击和滚动。
- 再按 `Alt+Q` 或 `Escape` 取消。
- 目标卸载时清理固定状态。
- 固定后显示“已固定 · ⌥Q 取消”。

外部 overlay 预览：

- 继续使用现有主进程全局 `Option+Q` 和 pinned IPC。
- renderer 不建立第二份外部 pinned 状态。
- `CardPreviewWindow` 根据真实 pinned 事件切 mode。
- 切到炉石以外应用时取消并隐藏。

测试必须用真实键盘事件或 IPC 状态变化，禁止直接伪造最终组件属性冒充交互成功。

### Step 3：删除主窗口假数据

删除：

- 用事件数量猜当前回合。
- 用事件数量猜奥秘。
- 把疲劳固定成零。
- 用数组下标伪造出牌回合。
- 用旧 `opponentPlayed/opponentSecrets` 判断是否为空。

改读：

- 手牌：`cardTracking.opponent.current.hand`。
- 牌库：`cardTracking.opponent.current.deck`。
- 奥秘：`cardTracking.opponent.current.secret`。
- 已使用：`cardTracking.opponent.used.items`。
- 疲劳：现有公开计数。
- 没有真实回合字段时显示 `?`。

界面类型允许未知字符串，不能把未知强制转成数字 0。

### Step 4：自动奥秘不抢焦点

新建：

```ts
presentOpponentSecretOverlay(host): Promise<void>
```

该 host 接口只提供：

- `ensureWindow({ showWhenReady: false })`。
- `isStillValid(window)`。
- `showInactive()`。

接口不提供 `focus()`，让自动事件无法走聚焦路径。

用户主动点击打开对手窗仍走现有可聚焦路径；两条路径不能合并。

测试：

- 奥秘 0 到 1：`showInactive` 一次，`show/focus` 零次。
- 创建过程中设置关闭或代次变化：不显示。
- 已折叠窗口收到奥秘：只更新徽标，不展开。
- 普通 tracker 状态更新不调用 `show()` 或 `focus()`。
- 自动显示我方窗口只调用 `showInactive()`。
- 自动恢复对手折叠入口只调用 `showInactive()`，不自动展开。
- 用户主动点击打开对手窗仍允许聚焦，作为反例锁死自动和主动两条路径。

### 验收

```bash
rtk npm test -- tests/cardDetailBody.test.tsx tests/cardDetailCardPool.test.tsx tests/cardHoverPreview.test.tsx tests/cardPreviewWindowIsolation.test.tsx tests/cardPreviewDelivery.test.ts tests/dashboardView.test.ts tests/homeDashboard.test.tsx tests/opponentSecretOverlayPresenter.test.ts tests/opponentOverlayWindowController.test.ts tests/automaticOverlayController.test.ts tests/windowExperience.test.ts
rtk npm run typecheck
rtk npm run build
```

### 提交

逐个暂存本任务文件，禁止暂存整个目录：

```bash
rtk git add src/renderer/components/CardDetailBody.tsx src/renderer/components/CardHoverPreview.tsx src/renderer/components/CardLibraryPanel.tsx src/renderer/components/DeckPanel.tsx src/renderer/components/OpponentPanel.tsx src/renderer/components/ArenaPanel.tsx src/renderer/App.tsx src/renderer/cardHoverStyles.css src/renderer/dashboardView.ts src/main/opponentSecretOverlayPresenter.ts src/main/main.ts tests/cardDetailBody.test.tsx tests/cardDetailCardPool.test.tsx tests/cardHoverPreview.test.tsx tests/cardPreviewWindowIsolation.test.tsx tests/cardPreviewDelivery.test.ts tests/dashboardView.test.ts tests/homeDashboard.test.tsx tests/opponentSecretOverlayPresenter.test.ts tests/opponentOverlayWindowController.test.ts tests/automaticOverlayController.test.ts tests/windowExperience.test.ts
rtk git diff --cached --check
rtk git commit -m "fix: make card details and overlay focus truthful"
```

---

## Task 8：收紧必填契约并清除 renderer 旧读取

**Files**

- Modify: `src/shared/types.ts`
- Modify: `src/renderer/runtimeValidation.ts`
- Modify: `src/renderer/types.ts`
- Modify: `src/renderer/overlayView.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/dashboardView.ts`
- Modify: `tests/fixtures/publicTrackerState.ts`
- Modify: `tests/appCardLibraryRefresh.test.tsx`
- Modify: `tests/appDesktopNavigation.test.tsx`
- Modify: `tests/appLogRepairFlow.test.tsx`
- Modify: `tests/appMatchHistory.test.tsx`
- Modify: `tests/appSettings.test.tsx`
- Modify: `tests/arenaChoiceRendererStateStability.test.tsx`
- Modify: `tests/arenaChoiceStability.test.ts`
- Modify: `tests/automaticOverlayController.test.ts`
- Modify: `tests/dashboardView.test.ts`
- Modify: `tests/frontendStability.test.ts`
- Modify: `tests/homeDashboard.test.tsx`
- Modify: `tests/ladderDeckOverlayController.test.ts`
- Modify: `tests/overlayPanel.test.tsx`
- Modify: `tests/overlayView.test.ts`
- Modify: `tests/overlayViewDataIntegrity.test.tsx`
- Modify: `tests/runtimeValidation.test.ts`

### Step 1：改成必填

```ts
readonly cardTracking: PublicCardTracking;
```

删除：

- legacy 测试工厂。
- 缺少 `cardTracking` 仍接受的测试。
- 正常工厂的非法覆盖入口。

### Step 2：全仓迁移

所有测试状态字面量改用正常工厂，包括但不限于：

- App 测试。
- renderer 测试。
- `automaticOverlayController.test.ts`。
- `ladderDeckOverlayController.test.ts`。
- `arenaChoiceStability.test.ts`。

不得只迁移 renderer 目录。

### Step 3：renderer 零读取旧混合字段

删除 renderer view model 和调用中的：

```text
friendlyHand
friendlyOther
opponentDeck
opponentHand
opponentOther
opponentPlayed
opponentSecrets
opponentDeckCount
opponentHandCount
opponentUnknownHandCount
```

共享状态中的旧字段保留一版，供非 renderer 兼容；新界面不读取。

`globalEffects/opponentGlobalEffects` 保留，它们不是卡牌物理位置。

搜索：

```bash
rtk proxy rg -n 'friendlyHand|friendlyOther|opponentDeck|opponentHand|opponentOther|opponentPlayed|opponentSecrets' src/renderer
```

只允许：

- 设置名。
- 类型迁移注释。

不得参与渲染和数量计算。

### 验收

```bash
rtk npm test
rtk npm run typecheck
rtk npm run build
```

### 提交

```bash
rtk git add src/shared/types.ts src/renderer/runtimeValidation.ts src/renderer/types.ts src/renderer/overlayView.ts src/renderer/App.tsx src/renderer/dashboardView.ts tests/fixtures/publicTrackerState.ts tests/appCardLibraryRefresh.test.tsx tests/appDesktopNavigation.test.tsx tests/appLogRepairFlow.test.tsx tests/appMatchHistory.test.tsx tests/appSettings.test.tsx tests/arenaChoiceRendererStateStability.test.tsx tests/arenaChoiceStability.test.ts tests/automaticOverlayController.test.ts tests/dashboardView.test.ts tests/frontendStability.test.ts tests/homeDashboard.test.tsx tests/ladderDeckOverlayController.test.ts tests/overlayPanel.test.tsx tests/overlayView.test.ts tests/overlayViewDataIntegrity.test.tsx tests/runtimeValidation.test.ts
rtk git diff --cached --check
rtk git commit -m "refactor: require card lifecycle state in renderer"
```

---

## Task 9：真实日志回放和真实 Electron UI 验收

**Files**

- Create: `fixtures/card-tracking/full-hand-burn.log`
- Create: `fixtures/card-tracking/card-use-return.log`
- Create: `fixtures/card-tracking/yogg-uses.log`
- Create: `tests/cardLifecycleReplay.test.ts`
- Create: `scripts/verify-card-lifecycle-ui.mjs`
- Modify: `package.json`
- Modify: `src/main/main.ts`，只增加 QA inspection 输出
- Create: `tests/cardLifecycleUiVerification.test.ts`

### Step 1：真实日志夹具

夹具必须脱敏，只保留复现所需日志行，不提交用户真实 Power.log。

覆盖：

- 十张手牌后的牌库进入墓地。
- 九张手牌不误报。
- 晚揭示烧毁身份。
- 普通使用。
- 回手再使用。
- 未知身份使用后晚揭示。
- 古神五张。
- 双倍十张。
- 重复法术。
- 两次古神使用。
- 古神套古神。
- GameState 与 PowerTaskList 重复输出。

### Step 2：回放断言结果正确

禁止只比较不同分块结果相等。

测试必须使用固定引擎工厂：

```ts
createReplayEngine(): TrackerEngine
```

该工厂必须：

- 传入固定脱敏卡牌数据库。
- 传入固定 `deckText`。
- 调用 `setFriendlyController()`。
- 数据库包含古神、烧毁测试牌、普通使用牌和夹具中的全部随机法术。
- 不读取本机卡牌缓存或用户牌库。

必须直接断言：

- 牌库、手牌、墓地数量。
- burned 次数。
- used 次数和唯一 `usageId`。
- 回手使用两次。
- 每次古神结果数量和顺序。
- 嵌套父子关系。
- 重复日志去重。
- 晚揭示没有新增事件。

本任务不修改 `splitCompleteLogChunk()`，不写 UTF-8 修复说明。

### Step 3：真实 UI 验收脚本

新增：

```json
"verify:card-lifecycle-ui": "node scripts/verify-card-lifecycle-ui.mjs"
```

脚本只启动项目 Electron，不打开其它浏览器。每个场景使用独立临时 userData：

1. 我方 `100×200`。
2. 我方 `100×900`，仅在目标显示器 `workArea.height >= 900` 时执行。
3. 对手 `250×170`，有奥秘。
4. 对手 `250×170`，未知手牌。
5. 内嵌普通详情。
6. 内嵌固定详情。
7. 外部普通详情。
8. 外部固定详情。

`100×900` 前置条件：

- 脚本先读取目标 display 的 `workArea`。
- 工作区足够时，BrowserWindow 和 viewport 必须严格 `100×900`。
- 工作区不足时明确返回“当前环境无法验证 100×900”，整体验收不得冒充通过；换到足够工作区后重跑。
- 产品恢复逻辑仍使用 `min(900, workArea.height)`，禁止为了测试把窗口移出工作区。

固定动作必须走真实路径：

- 内嵌：先激活真实卡牌 target，再派发真实 `KeyboardEvent`，包含 `altKey=true` 和 `code="KeyQ"`。
- 外部：QA 环境可以设置 `QA_PIN_CARD_PREVIEW=1`，但该入口必须调用生产 `setCardPreviewPinned(true)`；禁止直接伪造 renderer 属性或最终 IPC 状态。
- 两条路径都要验证取消固定、mouseleave 和自动隐藏规则。

inspection 输出：

```ts
{
  viewport,
  layoutMode,
  page,
  expandedKeys,
  shellRect,
  mainRect,
  footerRect,
  visibleCardRowRects,
  shellScrollSize,
  mainScrollSize,
  designatedScrollOwners,
  actualScrollableSelectors,
  consoleErrorCount,
  preview
}
```

硬断言：

- BrowserWindow bounds 和 viewport 与目标尺寸相等。
- `100×200` 为 short，只展开 deck，固定夹具第三行位于主内容内且不压底栏。
- 工作区足够时，`100×900` 为 tall，系统默认 deck + hand。
- `250×170` 有奥秘时首开 secret。
- 未知手牌只显示一行 `未公开 ×N`。
- 无横向溢出。
- 外壳不滚动。
- 指定滚动宿主只有主内容。
- inspection 必须扫描全部元素的 computed `overflowY` 和 `scrollHeight > clientHeight`，不能只相信 data 属性。
- 内容不足时允许滚动量 0；强制溢出夹具的 `actualScrollableSelectors` 必须严格等于主内容。
- 内嵌和外部普通详情都没有理论池和继续按钮。
- 内嵌和外部固定详情都经过真实固定动作，理论池展开 12 张，继续按钮存在。
- 五张夹具严格 `outcomeRows === 5`。
- 双倍夹具严格 `outcomeRows === 10`。
- 重复法术数量和嵌套层级分别断言。
- 结果子树 `actualScrollableSelectors` 为空；详情只允许外壳成为滚动宿主。
- 控制台错误数为 0。

脚本结束时只关闭本轮 Electron 子进程并清理临时目录。

### 验收

```bash
rtk npm test -- tests/cardLifecycleReplay.test.ts tests/cardLifecycleUiVerification.test.ts
rtk npm run typecheck
rtk npm run build
rtk npm run verify:card-lifecycle-ui
```

### 提交

逐个暂存本任务文件：

```bash
rtk git add fixtures/card-tracking/full-hand-burn.log fixtures/card-tracking/card-use-return.log fixtures/card-tracking/yogg-uses.log tests/cardLifecycleReplay.test.ts scripts/verify-card-lifecycle-ui.mjs package.json src/main/main.ts tests/cardLifecycleUiVerification.test.ts
rtk git diff --cached --check
rtk git commit -m "test: verify card lifecycle with real logs and windows"
```

---

## Task 10：文档、版本和 GitHub 上传

**Files**

- Modify: `docs/architecture.md`
- Modify: `docs/backend.md`
- Modify: `docs/frontend.md`
- Modify: `docs/ux.md`
- Create: `docs/releases/v0.2.9.md`
- Modify: `package.json`
- Modify: `package-lock.json`

### Step 1：更新文档

必须写清：

- `TrackerEngine` 是局内唯一事实来源。
- used 只有一套可修改记录。
- 古神结果按 `usageId` 绑定。
- 当前区域与事件历史不能相加。
- 满手烧毁只显示“疑似烧毁”。
- 奥秘槽位和候选不是同一个数量。
- 我方默认 `100×900`，允许缩到 `100×200`。
- 旧共享字段仅保留一版兼容，renderer 已停止读取。

### Step 2：修复说明

`docs/releases/v0.2.9.md`：

```markdown
# v0.2.9

## 修复

- 分开牌库、手牌、场上、奥秘、墓地和移除区。
- 分开当前位置、疑似烧毁和已使用历史。
- 修复满手烧毁后卡牌仍留在记牌器的问题。
- 修复普通打出与烧毁混淆。
- 修复回手后再次使用被漏记。
- 修复隐藏牌晚揭示后重复计数。
- 古神详情按每次使用展示真实结果。
- 支持双倍 10 张、重复法术、多次使用和古神套古神。
- 理论候选池与本次实际结果分开。
- 我方小窗支持 100×200 和 100×900，对手小窗支持 250×170。

## 证据限制

- 只有日志确认手牌为 10 张，且牌库直接进入墓地时，才显示“疑似烧毁”。
- 没有可靠日志证据时不猜测牌的来源。

## 发布范围

- 本次只上传源码。
- 没有重新生成安装包。
```

禁止写入 UTF-8 修复。

### Step 3：最终自动验收

```bash
rtk npm test
rtk npm run typecheck
rtk npm run build
rtk npm run verify:card-lifecycle-ui
rtk git diff --check
```

全部 exit code 0 才继续。

### Step 4：版本升级

```bash
rtk npm version 0.2.9 --no-git-tag-version
rtk npm test
rtk npm run typecheck
rtk npm run build
```

### Step 5：上传前检查

```bash
rtk git status --short
rtk git branch --show-current
rtk git remote get-url origin
rtk git fetch origin
rtk git rev-list --left-right --count origin/main...HEAD
rtk git diff --check
```

要求：

- 当前分支必须仍为 `main`；不是 `main` 时停止，不把未知分支强推到主分支。
- `origin` 必须仍是已确认仓库。
- `origin/main` 不得领先本地；若领先，停止上传并先处理远端变化。
- 待提交内容不包含：
  - 用户日志。
  - 截图。
  - 安装包。
  - 用户目录。
  - `.env`。
  - Token、私钥或账号资料。

### Step 6：版本提交

逐个暂存文档和版本文件，然后扫描真正将要提交的内容：

```bash
rtk git add docs/architecture.md docs/backend.md docs/frontend.md docs/ux.md docs/releases/v0.2.9.md package.json package-lock.json
rtk git diff --cached --name-only
rtk git diff --cached --check
rtk git grep --cached -n -E '(BEGIN .*PRIVATE KEY|api[_-]?key|access[_-]?token|Power\\.log|Player\\.log)'
rtk git commit -m "chore: release v0.2.9"
```

扫描命中后逐项判断；任何真实秘密或用户日志都必须移出暂存，不能继续 commit。

`git grep --cached` 没有命中时会返回 exit code 1；这里代表扫描未发现匹配项，不是发布失败。

### Step 7：最终复核并上传

```bash
rtk npm test
rtk npm run typecheck
rtk npm run build
rtk npm run verify:card-lifecycle-ui
rtk git status --short
rtk git log -5 --oneline
rtk git push origin HEAD:main
```

只有 push 成功后才汇报 GitHub 已上传。

不创建安装包 Release，不声称旧安装包包含本次修复。

### 验收

- 版本为 `0.2.9`。
- 全量测试、类型检查、构建、真实 UI 验收全部通过。
- `origin/main` 包含本次提交。
- 工作区只剩实施前已确认的用户修改。
- 没有生成或上传安装包。

---

## 5. 主控打回条件

出现任一情况，任务直接打回：

- 新旧 used 两套数组同时存在。
- 古神结果仍按 `cardId` 给 used 行分配。
- 两次同名古神显示相同整局结果。
- 身份未知的真实 PLAY 被直接丢掉。
- “未公开”被创建成普通卡牌。
- 奥秘候选数量被当成当前奥秘数量。
- 满手判断统计附属实体。
- renderer 继续从“其他”猜区域。
- 主窗口继续猜回合、奥秘或疲劳。
- `100×200` 只在 DOM 测试存在，真实 BrowserWindow 仍最小 900。
- 新奥秘调用 `focus()`。
- 普通悬停仍加载理论池。
- `cardDetailCardPool.test.tsx` 没有随批次修改。
- 任务结束时需要等后续任务才能通过 build。
- 使用 `git add .`、`git add -A` 或整个 `tests` 目录。
- 发布说明声称修复未验证的问题。

---

## 6. 最终交付内容

完成后汇报只包含：

- 版本 `0.2.9`。
- 修复的具体问题。
- 自动测试、类型检查、构建和真实 UI 验收结果。
- GitHub 分支和提交。
- 明确说明没有重新打包。
- 仍存在的日志证据限制。

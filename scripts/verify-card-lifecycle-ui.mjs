import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createChildEnvironment,
  createNodeEnvironmentUnsetArguments
} from "./card-lifecycle-qa-environment.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const electronPath = join(projectRoot, "node_modules/.bin/electron");
const fixturePath = join(projectRoot, "fixtures/card-tracking/full-hand-burn.log");
const scenarioNames = [
  "friendly-short",
  "friendly-tall",
  "opponent-secret",
  "opponent-unknown-hand",
  "inline-normal",
  "inline-pinned",
  "external-normal",
  "external-pinned"
];
const rawScenarioFilter = process.env.QA_SCENARIO_FILTER;
if (rawScenarioFilter !== undefined && rawScenarioFilter.trim() === "") {
  throw new Error("QA_SCENARIO_FILTER 不能为空");
}
const scenarioFilter = rawScenarioFilter?.trim();
if (scenarioFilter && !scenarioNames.includes(scenarioFilter)) {
  throw new Error(`未知 QA_SCENARIO_FILTER：${scenarioFilter}`);
}

const fixtureText = await readFile(fixturePath, "utf8");
const temporaryRoot = await mkdtemp(join(tmpdir(), "hearthstone-card-lifecycle-ui-"));
const failures = [];
let workArea;
let workAreas = [];

const cardCache = {
  source: "脱敏生命周期 QA 卡牌库",
  version: "card-lifecycle-ui-1",
  fetchedAt: new Date().toISOString(),
  cards: [
    {
      dbfId: 103270,
      cardId: "TOY_372",
      name: "匣中古神",
      collectible: 1,
      type: "SPELL",
      cost: 7,
      text: "随机施放5个法术。".repeat(120)
    },
    { dbfId: 1, cardId: "BURNED_CARD", name: "烧毁测试牌", collectible: 1, type: "SPELL", cost: 1 },
    { dbfId: 2, cardId: "FRIEND_USE", name: "普通使用牌", collectible: 1, type: "SPELL", cost: 2 },
    ...Array.from({ length: 15 }, (_, index) => ({
      dbfId: 200 + index,
      cardId: `RANDOM_SPELL_${index + 1}`,
      name: `随机法术${index + 1}`,
      collectible: 1,
      type: "SPELL",
      cost: (index % 10) + 1,
      text: `脱敏法术说明${index + 1}。`
    }))
  ]
};
const qaDeckText = [
  "2x 烧毁测试牌",
  "2x 普通使用牌",
  "2x 匣中古神",
  ...Array.from({ length: 6 }, (_, index) => `1x 随机法术${index + 1}`)
].join("\n");

async function prepareUserData(name, bounds, opponent = false) {
  const userData = join(temporaryRoot, name);
  await mkdir(userData, { recursive: true });
  const isolatedPowerLog = join(userData, "Power.log");
  await writeFile(isolatedPowerLog, fixtureText, "utf8");
  await writeFile(
    join(userData, "hearthstone-cards.zhCN.blizzard.json"),
    `${JSON.stringify(cardCache)}\n`,
    "utf8"
  );
  if (bounds) {
    await writeFile(
      join(userData, opponent ? "opponent-overlay-window-bounds.json" : "overlay-window-bounds.json"),
      `${JSON.stringify(bounds)}\n`,
      "utf8"
    );
  }
  return { userData, isolatedPowerLog };
}

function isProcessGroupAlive(processGroupId) {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ESRCH") return false;
    if (error && typeof error === "object" && error.code === "EPERM") return true;
    throw error;
  }
}

function signalProcessGroup(processGroupId, signal) {
  try {
    process.kill(-processGroupId, signal);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ESRCH") return;
    throw error;
  }
}

async function waitForProcessGroupExit(processGroupId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (isProcessGroupAlive(processGroupId) && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  return !isProcessGroupAlive(processGroupId);
}

async function terminateProcessGroup(processGroupId) {
  if (!processGroupId || !isProcessGroupAlive(processGroupId)) return;
  signalProcessGroup(processGroupId, "SIGTERM");
  if (await waitForProcessGroupExit(processGroupId, 1_500)) return;
  signalProcessGroup(processGroupId, "SIGKILL");
  assert.equal(
    await waitForProcessGroupExit(processGroupId, 1_500),
    true,
    `Electron 进程组 ${processGroupId} 未能清理`
  );
}

async function runElectronScenario(name, extraEnvironment = {}, bounds, opponent = false) {
  const { userData, isolatedPowerLog } = await prepareUserData(name, bounds, opponent);
  const inspectPath = join(userData, "inspection.json");
  const child = spawn("/usr/bin/env", [
    ...createNodeEnvironmentUnsetArguments(process.env),
    electronPath,
    projectRoot
  ], {
    cwd: projectRoot,
    env: createChildEnvironment(
      process.env,
      extraEnvironment,
      userData,
      isolatedPowerLog,
      inspectPath
    ),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const processGroupId = child.pid;
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  let timeout;
  try {
    const exitCode = await Promise.race([
      new Promise((resolveExit, rejectExit) => {
        child.once("error", rejectExit);
        child.once("exit", (code, signal) => {
          if (signal) rejectExit(new Error(`${name} Electron 被信号 ${signal} 终止`));
          else resolveExit(code);
        });
      }),
      new Promise((_, rejectTimeout) => {
        timeout = setTimeout(() => rejectTimeout(new Error(`${name} Electron 验证超时`)), 30_000);
      })
    ]);
    assert.equal(exitCode, 0, `${name} Electron 退出码应为 0\n${output.slice(-2000)}`);
    const inspection = JSON.parse(await readFile(inspectPath, "utf8"));
    assert.equal(
      inspection.trackerState?.logPath,
      isolatedPowerLog,
      `${name}: 只能读取本场临时 Power.log`
    );
    assert.deepEqual(
      inspection.inheritedNodeEnvironmentKeys,
      [],
      `${name}: Electron 不能继承任何 NODE_* 环境变量`
    );
    return inspection;
  } finally {
    clearTimeout(timeout);
    await terminateProcessGroup(processGroupId);
  }
}

function assertCommon(name, inspection) {
  assert.equal(inspection.consoleErrorCount, 0, `${name}: 控制台不能有错误`);
  assertNoHorizontalOverflow(name, inspection);
  assert.deepEqual(
    inspection.designatedScrollOwners,
    ["card-tracking-main"],
    `${name}: 只能指定主内容区滚动；${JSON.stringify({
      location: inspection.location,
      layoutMode: inspection.layoutMode,
      bodyText: inspection.bodyText,
      trackerState: {
        status: inspection.trackerState?.status,
        trackerMode: inspection.trackerState?.trackerMode,
        gameActive: inspection.trackerState?.gameActive,
        logPath: inspection.trackerState?.logPath,
        arena: inspection.trackerState?.arena
      }
    })}`
  );
  assert.ok(
    !inspection.actualScrollableSelectors.some((selector) => selector.includes("overlay-shell")),
    `${name}: 外壳不能滚动`
  );
  assert.ok(
    inspection.shellScrollSize.scrollHeight <= inspection.shellScrollSize.clientHeight,
    `${name}: 外壳内容不能溢出`
  );
  assert.ok(
    inspection.shellScrollSize.scrollWidth <= inspection.shellScrollSize.clientWidth,
    `${name}: 外壳不能横向滚动`
  );
}

function assertNoHorizontalOverflow(name, inspection) {
  assert.deepEqual(
    inspection.horizontalOverflowSelectors,
    [],
    `${name}: 任意元素都不能横向溢出`
  );
}

function assertExactWindow(name, inspection, width, height) {
  assert.deepEqual(
    { width: inspection.bounds.width, height: inspection.bounds.height },
    { width, height },
    `${name}: BrowserWindow 尺寸必须精确`
  );
  assert.deepEqual(inspection.viewport, { width, height }, `${name}: viewport 必须精确`);
}

async function verifyFriendlyShort() {
  const inspection = await runElectronScenario(
    "friendly-short",
    {
      QA_OPEN_OVERLAY: "1",
      QA_DECK_TEXT: qaDeckText
    },
    { x: 0, y: 0, width: 100, height: 200 }
  );
  workArea = inspection.workArea;
  workAreas = inspection.workAreas;
  assertExactWindow("friendly-short", inspection, 100, 200);
  assertCommon("friendly-short", inspection);
  assert.equal(inspection.layoutMode, "short");
  assert.equal(inspection.page, "current");
  assert.deepEqual(inspection.expandedKeys, ["deck"]);
  assert.deepEqual(
    inspection.actualScrollableSelectors,
    ["main.card-tracking-main"],
    `friendly-short: 强制溢出只能由主内容区滚动；${JSON.stringify({
      mainScrollSize: inspection.mainScrollSize,
      shellRect: inspection.shellRect,
      shellComputed: inspection.shellComputed,
      visibleRows: inspection.visibleCardRowRects.length,
      bodyText: inspection.bodyText
    })}`
  );
  assert.ok(inspection.visibleCardRowRects.length >= 3, "friendly-short: 牌库至少三行");
  const third = inspection.visibleCardRowRects[2];
  assert.ok(third.top >= inspection.mainRect.top && third.bottom <= inspection.mainRect.bottom, "friendly-short: 第三行必须在主内容区");
  assert.ok(third.bottom <= inspection.footerRect.top, "friendly-short: 第三行不能盖住底栏");
}

async function verifyFriendlyTall() {
  if (workAreas.length === 0) {
    await verifyFriendlyShort();
  }
  const tallWorkArea = workAreas.find((workArea) => workArea.height >= 900);
  if (!tallWorkArea) {
    throw new Error(`当前环境无法验证 100×900：所有显示器 workArea=${JSON.stringify(workAreas)}`);
  }
  const inspection = await runElectronScenario(
    "friendly-tall",
    {
      QA_OPEN_OVERLAY: "1",
      QA_DECK_TEXT: qaDeckText
    },
    { x: tallWorkArea.x, y: tallWorkArea.y, width: 100, height: 900 }
  );
  assertExactWindow("friendly-tall", inspection, 100, 900);
  assertCommon("friendly-tall", inspection);
  assert.equal(inspection.layoutMode, "tall");
  assert.equal(inspection.page, "current");
  assert.deepEqual(inspection.expandedKeys, ["deck", "hand"]);
}

async function verifyOpponentSecret() {
  const inspection = await runElectronScenario(
    "opponent-secret",
    { QA_OPEN_OPPONENT_OVERLAY: "1" },
    {
      x: workArea?.x ?? 0,
      y: workArea?.y ?? 0,
      width: 250,
      height: 170
    },
    true
  );
  assertExactWindow("opponent-secret", inspection, 250, 170);
  assertCommon("opponent-secret", inspection);
  assert.equal(inspection.layoutMode, "opponent");
  assert.deepEqual(inspection.expandedKeys, ["secret"]);
}

async function verifyOpponentUnknownHand() {
  const inspection = await runElectronScenario(
    "opponent-unknown-hand",
    {
      QA_OPEN_OPPONENT_OVERLAY: "1",
      QA_OPPONENT_REAL_STATE: "1",
      QA_OPEN_TRACKING_GROUP: "hand"
    },
    {
      x: workArea?.x ?? 0,
      y: workArea?.y ?? 0,
      width: 250,
      height: 170
    },
    true
  );
  assertExactWindow("opponent-unknown-hand", inspection, 250, 170);
  assertCommon("opponent-unknown-hand", inspection);
  assert.deepEqual(inspection.expandedKeys, ["hand"]);
  assert.deepEqual(inspection.unknownHandRows, ["未公开 ×1"]);
}

function assertNormalPreview(name, preview) {
  assertPreviewScrollContract(name, preview);
  assert.equal(preview.visible, true, `${name}: 预览应显示`);
  assert.equal(preview.pinned, false, `${name}: 普通预览不能固定`);
  assert.equal(preview.poolExpanded, false, `${name}: 普通预览不能显示候选池`);
  assert.equal(preview.poolRows, 0, `${name}: 普通预览不能渲染候选池行`);
  assert.equal(preview.continueButton, false, `${name}: 普通预览不能显示继续按钮`);
}

function assertPinnedPreview(name, preview, withOutcomes) {
  assertPreviewScrollContract(name, preview);
  assert.equal(preview.visible, true, `${name}: 固定预览应显示`);
  assert.equal(preview.pinned, true, `${name}: 必须通过真实固定逻辑`);
  assert.equal(preview.poolExpanded, true, `${name}: 固定预览应展开候选池`);
  assert.equal(preview.poolRows, 12, `${name}: 首批候选池必须显示 12 张`);
  assert.equal(preview.continueButton, true, `${name}: 候选池必须有继续按钮`);
  assert.equal(preview.afterUnpinHidden, true, `${name}: 取消固定并离开后必须自动隐藏`);
  if (withOutcomes) assertOutcomeDetails(name, preview);
}

function assertPreviewScrollContract(name, preview) {
  assert.equal(preview.consoleErrorCount, 0, `${name}: 详情窗口控制台不能有错误`);
  assert.deepEqual(
    preview.actualScrollableSelectors,
    [".card-preview-root"],
    `${name}: 详情只能由外壳滚动；${JSON.stringify({
      scrollSize: preview.scrollSize,
      text: preview.text?.slice(0, 240)
    })}`
  );
  assert.deepEqual(preview.resultScrollableSelectors, [], `${name}: 结果子树不能形成滚动区`);
}

function assertOutcomeDetails(name, preview) {
  assert.deepEqual(preview.outcomeRows, [5, 10], `${name}: 五连和双倍结果数量必须精确`);
  assert.equal(preview.duplicateSpellCount, 2, `${name}: 重复法术必须保留两次`);
  assert.equal(preview.nestedOutcomeGroups, 1, `${name}: 嵌套古神层级必须保留`);
  assert.deepEqual(preview.designatedScrollOwners, [], `${name}: 结果子树不能声明滚动所有者`);
  assert.deepEqual(preview.resultScrollableSelectors, [], `${name}: 结果子树不能形成第二滚动区`);
}

async function verifyInline(name, pinned) {
  const inspection = await runElectronScenario(name, {
    QA_OPEN_CARD_LIBRARY: "1",
    QA_CARD_LIBRARY_SEARCH: "匣中古神",
    QA_HOVER_CARD: "1",
    ...(pinned ? { QA_INLINE_PIN_KEYBOARD_EVENT: "KeyboardEvent" } : {})
  });
  assert.equal(inspection.consoleErrorCount, 0, `${name}: 控制台不能有错误`);
  if (pinned) assertPinnedPreview(name, inspection.preview, false);
  else assertNormalPreview(name, inspection.preview);
}

async function verifyExternal(name, pinned) {
  const inspection = await runElectronScenario(
    name,
    {
      QA_OPEN_OVERLAY: "1",
      QA_SHOW_CARD_PREVIEW: "1",
      ...(pinned ? { QA_PIN_CARD_PREVIEW: "1" } : {})
    },
    {
      x: workArea?.x ?? 0,
      y: workArea?.y ?? 0,
      width: 300,
      height: 600
    }
  );
  assert.equal(inspection.consoleErrorCount, 0, `${name}: 控制台不能有错误`);
  if (pinned) assertPinnedPreview(name, inspection.preview, true);
  else {
    assertNormalPreview(name, inspection.preview);
    assertOutcomeDetails(name, inspection.preview);
  }
}

const verifications = [
  ["friendly-short", verifyFriendlyShort],
  ["friendly-tall", verifyFriendlyTall],
  ["opponent-secret", verifyOpponentSecret],
  ["opponent-unknown-hand", verifyOpponentUnknownHand],
  ["inline-normal", () => verifyInline("inline-normal", false)],
  ["inline-pinned", () => verifyInline("inline-pinned", true)],
  ["external-normal", () => verifyExternal("external-normal", false)],
  ["external-pinned", () => verifyExternal("external-pinned", true)]
];

try {
  assert.deepEqual(verifications.map(([name]) => name), scenarioNames);
  for (const [name, verify] of verifications) {
    if (scenarioFilter && name !== scenarioFilter) continue;
    try {
      await verify();
      process.stdout.write(`通过 ${name}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${name}: ${message}`);
      process.stderr.write(`失败 ${name}: ${message}\n`);
    }
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

if (failures.length > 0) {
  throw new AggregateError(failures.map((message) => new Error(message)), `生命周期 UI 验证失败：${failures.length} 项`);
}

process.stdout.write(scenarioFilter ? `指定场景 ${scenarioFilter} 通过\n` : "8 个生命周期 Electron 场景全部通过\n");

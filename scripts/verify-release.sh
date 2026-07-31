#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
evidence_dir="$root_dir/outputs/release-verification"
screenshots_dir="$evidence_dir/screenshots"
inspections_dir="$evidence_dir/inspections"
metrics_file="$evidence_dir/baseline.tsv"
app_path="$root_dir/outputs/炉石记牌器.app"
app_executable="$app_path/Contents/MacOS/炉石记牌器"
redraft_source_dir="$root_dir/fixtures/logs/arena-redraft-session"
redraft_partial_fixture="outputs/release-verification/fixtures/arena-redraft-partial"
redraft_exact_fixture="outputs/release-verification/fixtures/arena-redraft-exact"
arena_playing_fixture="outputs/release-verification/fixtures/arena-playing"
active_qa_pid=""

cleanup_active_qa_process() {
  local pid="${active_qa_pid:-}"
  active_qa_pid=""
  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    return
  fi

  kill "$pid" 2>/dev/null || true
  for _ in {1..20}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid" 2>/dev/null || true
      return
    fi
    sleep 0.1
  done

  kill -9 "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

trap cleanup_active_qa_process EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$screenshots_dir" "$inspections_dir"
rm -f "$screenshots_dir"/*.png "$inspections_dir"/*.json "$metrics_file"
printf 'scenario\tduration_ms\tevidence\n' > "$metrics_file"
metrics_header=$'scenario\tduration_ms\tevidence'

now_ms() {
  node -e 'process.stdout.write(String(Date.now()))'
}

require_file() {
  if [[ ! -s "$1" ]]; then
    echo "发布验证缺少证据：$1" >&2
    exit 1
  fi
}

prepare_arena_redraft_fixtures() {
  local partial_dir="$root_dir/$redraft_partial_fixture"
  local exact_dir="$root_dir/$redraft_exact_fixture"
  local playing_dir="$root_dir/$arena_playing_fixture"
  rm -rf "$partial_dir" "$exact_dir" "$playing_dir"
  rm -rf \
    "$evidence_dir/user-data/arena-redraft-partial-replay" \
    "$evidence_dir/user-data/arena-redraft-exact-replay" \
    "$evidence_dir/user-data/arena-playing-replay"
  mkdir -p "$partial_dir" "$exact_dir" "$playing_dir"
  for target_dir in "$partial_dir" "$exact_dir" "$playing_dir"; do
    cp "$redraft_source_dir/Arena.log" "$target_dir/Arena.log"
    cp "$redraft_source_dir/cards.qa-cache.json" "$target_dir/cards.qa-cache.json"
  done
  cp "$redraft_source_dir/Decks.after-redraft.log" "$exact_dir/Decks.log"
  cp "$redraft_source_dir/Decks.after-redraft.log" "$playing_dir/Decks.log"
  cp "$redraft_source_dir/Power.playing.log" "$playing_dir/Power.log"
  touch "$exact_dir/Decks.log"
  touch "$playing_dir/Arena.log" "$playing_dir/Decks.log" "$playing_dir/Power.log"
}

run_capture() {
  local name="$1"
  local fixture="$2"
  local qa_flag="${3:-}"
  local screenshot="$screenshots_dir/$name.png"
  local inspection="$inspections_dir/$name.json"
  local qa_user_data="$evidence_dir/user-data/$name"
  local qa_log_path="$root_dir/$fixture/Power.log"
  if [[ "$name" == arena-* ]]; then
    qa_log_path="$root_dir/$fixture/Arena.log"
  fi
  local started finished
  started="$(now_ms)"
  rm -rf "$qa_user_data"
  mkdir -p "$qa_user_data"
  if [[ -f "$root_dir/$fixture/cards.qa-cache.json" ]]; then
    cp "$root_dir/$fixture/cards.qa-cache.json" "$qa_user_data/hearthstone-cards.zhCN.blizzard.json"
  fi

  if [[ -n "$qa_flag" ]]; then
    env \
      HEARTHSTONE_LOG_DIR="$root_dir/$fixture" \
      QA_LOG_PATH="$qa_log_path" \
      QA_LOCK_LOG_PATH=1 \
      QA_SKIP_ARENA_SCREEN_RECOGNITION=1 \
      QA_ALLOW_MULTIPLE_INSTANCES=1 \
      QA_USER_DATA_DIR="$qa_user_data" \
      QA_SKIP_LOG_CONFIG_REPAIR=1 \
      QA_EXIT_AFTER_SCREENSHOT=1 \
      QA_SCREENSHOT_PATH="$screenshot" \
      QA_INSPECT_PATH="$inspection" \
      "$qa_flag"=1 \
      "$app_executable" &
  else
    env \
      HEARTHSTONE_LOG_DIR="$root_dir/$fixture" \
      QA_LOG_PATH="$qa_log_path" \
      QA_LOCK_LOG_PATH=1 \
      QA_SKIP_ARENA_SCREEN_RECOGNITION=1 \
      QA_ALLOW_MULTIPLE_INSTANCES=1 \
      QA_USER_DATA_DIR="$qa_user_data" \
      QA_SKIP_LOG_CONFIG_REPAIR=1 \
      QA_EXIT_AFTER_SCREENSHOT=1 \
      QA_SCREENSHOT_PATH="$screenshot" \
      QA_INSPECT_PATH="$inspection" \
      "$app_executable" &
  fi
  active_qa_pid=$!
  local qa_status=0
  wait "$active_qa_pid" || qa_status=$?
  active_qa_pid=""
  if [[ "$qa_status" -ne 0 ]]; then
    echo "QA 场景异常退出：$name（状态 $qa_status）" >&2
    return "$qa_status"
  fi

  require_file "$screenshot"
  require_file "$inspection"
  node -e '
    const fs = require("node:fs");
    const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (!report.hasApi || !report.location || !report.bodyText) process.exit(1);
    const scenario = process.argv[2];
    const fixture = process.argv[3];
    if (/\.card-detail-(?:copy|heading|image)\s*\{/.test(String(report.bodyText))) process.exit(37);
    if (report.trackerSettings?.general?.startMinimized !== false) process.exit(25);
    if (report.trackerSettings?.overlay?.position !== "right") process.exit(26);
    if (report.trackerSettings?.overlay?.showFriendlyAttack !== false) process.exit(27);
    if (report.trackerSettings?.overlay?.showOpponentAttack !== false) process.exit(28);
    if (scenario.endsWith("-replay")) {
      if (!report.trackerState || !String(report.trackerState.logPath ?? "").includes(fixture)) process.exit(2);
      if (report.trackerState.status !== "watching") process.exit(3);
      if (scenario === "normal-replay" && report.trackerState.gameActive !== true) process.exit(4);
      if (scenario === "auto-match-replay" && (!report.trackerState.autoMatchedDeckId || report.trackerState.deckName !== "智能匹配测试")) process.exit(5);
      if (scenario === "constructed-duplicate-replay") {
        const state = report.trackerState;
        const body = String(report.bodyText);
        if (!state.gameActive || state.deckName !== "学徒猎人" || state.summary?.remainingCards !== 28) process.exit(16);
        if (state.friendlyHand?.[0]?.cardId !== "JAM_037" || state.friendlyOther?.[0]?.cardId !== "CORE_DS1_184") process.exit(17);
        if (state.globalEffects?.length !== 0 || state.opponentGlobalEffects?.[0]?.cardId !== "JAIL_397") process.exit(18);
        if (!body.includes("学徒猎人") || body.includes("牌库中暂无卡牌")) process.exit(19);
      }
      if (scenario === "arena-replay" && (report.trackerState.arena?.status !== "drafting" || report.trackerState.arena?.draftCount !== 2 || report.trackerState.arena?.deck?.length !== 2)) process.exit(6);
      if (scenario === "arena-redraft-partial-replay") {
        const arena = report.trackerState.arena;
        const body = String(report.bodyText);
        const fakeNames = ["日志缺失的竞技场牌", "未解析竞技场牌"];
        if (
          arena?.status !== "complete" ||
          arena?.draftCount !== 29 ||
          arena?.unresolvedCount !== 30 ||
          arena?.awaitingExactDeck !== true ||
          arena?.pendingRedraftChoices?.length !== 5
        ) process.exit(8);
        if (!["选取率", "卡牌", "影响"].every((label) => body.includes(label))) process.exit(9);
        if (body.includes("影响全局") || body.includes("牌库中") || body.includes("待识别")) process.exit(20);
        if (fakeNames.some((name) => body.includes(name))) process.exit(10);
        if (arena.deck?.some((card) => card.unresolved || fakeNames.includes(card.name))) process.exit(11);
      }
      if (scenario === "arena-redraft-exact-replay") {
        const arena = report.trackerState.arena;
        const arenaCards = arena?.deck ?? [];
        const trackerCards = report.trackerState.deck ?? [];
        const body = String(report.bodyText);
        const arenaTotal = arenaCards.reduce((sum, card) => sum + card.count, 0);
        const trackerTotal = trackerCards.reduce((sum, card) => sum + card.count, 0);
        const knownExactCard = (card) =>
          typeof card.name === "string" && /^测试牌\d{2}$/.test(card.name) &&
          typeof card.cardId === "string" && card.cardId.startsWith("TEST_ARENA_") &&
          card.unresolved !== true;
        const exactEvidence = JSON.stringify({ body, arenaCards, trackerCards });
        const invalidLabels = ["Unknown card", "未知卡牌", "未识别", "日志缺失的竞技场牌", "未解析竞技场牌"];
        if (arena?.status !== "complete" || arena?.draftCount !== 30 || arena?.unresolvedCount !== 0 || arenaTotal !== 30 || trackerTotal !== 30) process.exit(12);
        if (!["选取率", "卡牌", "影响"].every((label) => body.includes(label)) || body.includes("待识别")) process.exit(13);
        if (body.includes("影响全局") || body.includes("牌库中")) process.exit(21);
        if (arenaCards.length !== 30 || trackerCards.length !== 30 || !arenaCards.every(knownExactCard) || !trackerCards.every(knownExactCard)) process.exit(14);
        if (!body.includes("测试牌01") || !body.includes("测试牌30") || invalidLabels.some((label) => exactEvidence.includes(label))) process.exit(15);
      }
      if (scenario === "arena-playing-replay") {
        const arena = report.trackerState.arena;
        const body = String(report.bodyText);
        if (arena?.status !== "playing" || report.trackerState.gameActive !== true || report.trackerState.summary?.remainingCards !== 29) process.exit(22);
        if (!body.includes("牌库 (29)") || body.includes("等待开局")) process.exit(23);
        if (["选取率", "卡牌", "影响"].every((label) => body.includes(label))) process.exit(24);
      }
    }
    const routeByScenario = { "deck-overlay": "overlay=1", "constructed-duplicate-replay": "overlay=1", "arena-redraft-partial-replay": "overlay=1", "arena-redraft-exact-replay": "overlay=1", "arena-playing-replay": "overlay=1", "opponent-overlay": "opponent-overlay=1", "arena-choice-overlay": "arena-choice-overlay=1", "ladder-deck-overlay": "ladder-deck-overlay=1", "board-attack-overlay": "board-attack-overlay=1", "arena-hero-ranking-overlay": "arena-hero-ranking-overlay=1", "three-window-layout": "arena-hero-ranking-overlay=1" };
    if (routeByScenario[scenario] && !report.location.includes(routeByScenario[scenario])) process.exit(7);
    if (routeByScenario[scenario] && report.qaMainWindowVisible !== false) process.exit(36);
    if (scenario === "three-window-layout") {
      const { workArea, hero, opponent, friendly } = report.qaWindowLayout ?? {};
      const windowsOverlap = (left, right) =>
        left.x < right.x + right.width &&
        left.x + left.width > right.x &&
        left.y < right.y + right.height &&
        left.y + left.height > right.y;
      const insideWorkArea = (bounds) =>
        bounds.x >= workArea.x &&
        bounds.y >= workArea.y &&
        bounds.x + bounds.width <= workArea.x + workArea.width &&
        bounds.y + bounds.height <= workArea.y + workArea.height;
      if (!workArea || !hero?.bounds || !opponent?.bounds || !friendly?.bounds) process.exit(29);
      if (!hero.visible || !opponent.visible || !friendly.visible || hero.collapsed || opponent.collapsed || friendly.collapsed) process.exit(30);
      if (hero.bounds.width !== 100 || opponent.bounds.width !== 250 || friendly.bounds.width !== 100) process.exit(31);
      if (hero.bounds.x !== workArea.x || friendly.bounds.x + friendly.bounds.width !== workArea.x + workArea.width) process.exit(32);
      if (opponent.bounds.x !== hero.bounds.x + hero.bounds.width + 24) process.exit(33);
      if (![hero.bounds, opponent.bounds, friendly.bounds].every(insideWorkArea)) process.exit(34);
      if (
        windowsOverlap(hero.bounds, opponent.bounds) ||
        windowsOverlap(hero.bounds, friendly.bounds) ||
        windowsOverlap(opponent.bounds, friendly.bounds)
      ) process.exit(35);
    }
  ' "$inspection" "$name" "${fixture##*/}"
  finished="$(now_ms)"
  printf '%s\t%s\t%s\n' "$name" "$((finished - started))" "${screenshot#$root_dir/}" >> "$metrics_file"
}

echo "[1/7] 完整测试"
npm test
npm test -- \
  tests/mainWindowVisibility.test.ts \
  tests/automaticOverlayController.test.ts \
  tests/opponentOverlayWindowController.test.ts \
  tests/trackerSettingsStore.test.ts \
  tests/overlayWindowBounds.test.ts

echo "[2/7] 类型检查"
npm run typecheck

echo "[3/7] 正式构建"
npm run build

echo "[4/7] 签名打包"
npm run package:mac-arm64
require_file "$root_dir/outputs/炉石记牌器-mac-arm64.zip"
if [[ ! -s "$metrics_file" || "$(head -n 1 "$metrics_file")" != "$metrics_header" ]]; then
  echo "发布验证证据在打包时被清理" >&2
  exit 1
fi

echo "[5/7] 代表性日志回放与窗口截图"
prepare_arena_redraft_fixtures
run_capture normal-replay fixtures/logs/session-2026-07-10
run_capture auto-match-replay fixtures/logs/auto-match-session
run_capture constructed-duplicate-replay fixtures/logs/constructed-duplicate-create QA_OPEN_OVERLAY
run_capture arena-replay fixtures/logs/arena-session
run_capture arena-redraft-partial-replay "$redraft_partial_fixture" QA_OPEN_OVERLAY
run_capture arena-redraft-exact-replay "$redraft_exact_fixture" QA_OPEN_OVERLAY
run_capture arena-playing-replay "$arena_playing_fixture" QA_OPEN_OVERLAY
run_capture deck-overlay fixtures/logs/session-2026-07-10 QA_OPEN_OVERLAY
run_capture opponent-overlay fixtures/logs/session-2026-07-10 QA_OPEN_OPPONENT_OVERLAY
run_capture arena-choice-overlay fixtures/logs/arena-session QA_OPEN_ARENA_CHOICE_OVERLAY
run_capture ladder-deck-overlay fixtures/logs/session-2026-07-10 QA_OPEN_LADDER_DECK_OVERLAY
run_capture board-attack-overlay fixtures/logs/session-2026-07-10 QA_OPEN_BOARD_ATTACK_OVERLAY
run_capture arena-hero-ranking-overlay fixtures/logs/arena-session QA_OPEN_ARENA_HERO_RANKING_OVERLAY
run_capture three-window-layout fixtures/logs/arena-session QA_OPEN_THREE_WINDOW_LAYOUT
require_file "$screenshots_dir/arena-redraft-partial-replay.png"
require_file "$screenshots_dir/arena-redraft-exact-replay.png"
require_file "$screenshots_dir/arena-playing-replay.png"
require_file "$screenshots_dir/arena-hero-ranking-overlay.png"
require_file "$screenshots_dir/three-window-layout.png"
require_file "$inspections_dir/arena-redraft-partial-replay.json"
require_file "$inspections_dir/arena-redraft-exact-replay.json"
require_file "$inspections_dir/arena-playing-replay.json"
require_file "$inspections_dir/arena-hero-ranking-overlay.json"
require_file "$inspections_dir/three-window-layout.json"

echo "[6/7] 组件、签名、权限说明与架构"
for helper in arena-ocr frontmost-app; do
  helper_path="$app_path/Contents/Resources/$helper"
  if [[ ! -x "$helper_path" ]]; then
    echo "本机组件不可执行：$helper" >&2
    exit 1
  fi
  lipo -archs "$helper_path" | grep -qw arm64
done
lipo -archs "$app_executable" | grep -qw arm64
plutil -extract NSScreenCaptureUsageDescription raw "$app_path/Contents/Info.plist" | grep -q .
codesign --verify --deep --strict "$app_path"
if codesign -dv "$app_path" 2>&1 | grep -q 'Signature=adhoc'; then
  echo "安装包使用了临时签名" >&2
  exit 1
fi

echo "[7/7] 安装包启动"
launch_user_data="$evidence_dir/user-data/launch-check"
rm -rf "$launch_user_data"
mkdir -p "$launch_user_data"
env \
  QA_ALLOW_MULTIPLE_INSTANCES=1 \
  QA_USER_DATA_DIR="$launch_user_data" \
  QA_SKIP_LOG_CONFIG_REPAIR=1 \
  QA_SKIP_ARENA_SCREEN_RECOGNITION=1 \
  "$app_executable" >/dev/null 2>&1 &
launched_pid=$!
active_qa_pid="$launched_pid"
sleep 4
if ! kill -0 "$launched_pid" 2>/dev/null; then
  echo "安装包未成功启动" >&2
  exit 1
fi
cleanup_active_qa_process

printf 'idle-listening\tmanual\t打包应用连续空闲 5 分钟后用活动监视器记录\n' >> "$metrics_file"
printf 'high-frequency-log\tautomated\t日志并发、截断与会话切换回归测试通过\n' >> "$metrics_file"

echo "发布验证通过。证据保存在：$evidence_dir"

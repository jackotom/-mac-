#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
evidence_dir="$root_dir/outputs/release-verification"
screenshots_dir="$evidence_dir/screenshots"
inspections_dir="$evidence_dir/inspections"
metrics_file="$evidence_dir/baseline.tsv"
app_path="$root_dir/outputs/炉石记牌器.app"
app_executable="$app_path/Contents/MacOS/炉石记牌器"

mkdir -p "$screenshots_dir" "$inspections_dir"
rm -f "$screenshots_dir"/*.png "$inspections_dir"/*.json "$metrics_file"
printf 'scenario\tduration_ms\tevidence\n' > "$metrics_file"

now_ms() {
  node -e 'process.stdout.write(String(Date.now()))'
}

require_file() {
  if [[ ! -s "$1" ]]; then
    echo "发布验证缺少证据：$1" >&2
    exit 1
  fi
}

run_capture() {
  local name="$1"
  local fixture="$2"
  local qa_flag="${3:-}"
  local screenshot="$screenshots_dir/$name.png"
  local inspection="$inspections_dir/$name.json"
  local qa_log_path="$root_dir/$fixture/Power.log"
  if [[ "$name" == arena-* ]]; then
    qa_log_path="$root_dir/$fixture/Arena.log"
  fi
  local started finished
  started="$(now_ms)"

  if [[ -n "$qa_flag" ]]; then
    env \
      HEARTHSTONE_LOG_DIR="$root_dir/$fixture" \
      QA_LOG_PATH="$qa_log_path" \
      QA_LOCK_LOG_PATH=1 \
      QA_ALLOW_MULTIPLE_INSTANCES=1 \
      QA_USER_DATA_DIR="$evidence_dir/user-data/$name" \
      QA_EXIT_AFTER_SCREENSHOT=1 \
      QA_SCREENSHOT_PATH="$screenshot" \
      QA_INSPECT_PATH="$inspection" \
      "$qa_flag"=1 \
      "$app_executable"
  else
    env \
      HEARTHSTONE_LOG_DIR="$root_dir/$fixture" \
      QA_LOG_PATH="$qa_log_path" \
      QA_LOCK_LOG_PATH=1 \
      QA_ALLOW_MULTIPLE_INSTANCES=1 \
      QA_USER_DATA_DIR="$evidence_dir/user-data/$name" \
      QA_EXIT_AFTER_SCREENSHOT=1 \
      QA_SCREENSHOT_PATH="$screenshot" \
      QA_INSPECT_PATH="$inspection" \
      "$app_executable"
  fi

  require_file "$screenshot"
  require_file "$inspection"
  node -e '
    const fs = require("node:fs");
    const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (!report.hasApi || !report.location || !report.bodyText) process.exit(1);
    const scenario = process.argv[2];
    const fixture = process.argv[3];
    if (scenario.endsWith("-replay")) {
      if (!report.trackerState || !String(report.trackerState.logPath ?? "").includes(fixture)) process.exit(2);
      if (report.trackerState.status !== "watching") process.exit(3);
      if (scenario === "normal-replay" && report.trackerState.gameActive !== true) process.exit(4);
      if (scenario === "auto-match-replay" && (!report.trackerState.autoMatchedDeckId || report.trackerState.deckName !== "智能匹配测试")) process.exit(5);
      if (scenario === "arena-replay" && (report.trackerState.arena?.status !== "drafting" || report.trackerState.arena?.draftCount !== 2 || report.trackerState.arena?.deck?.length !== 2)) process.exit(6);
    }
    const routeByScenario = { "deck-overlay": "overlay=1", "opponent-overlay": "opponent-overlay=1", "arena-choice-overlay": "arena-choice-overlay=1", "ladder-deck-overlay": "ladder-deck-overlay=1", "board-attack-overlay": "board-attack-overlay=1" };
    if (routeByScenario[scenario] && !report.location.includes(routeByScenario[scenario])) process.exit(7);
  ' "$inspection" "$name" "${fixture##*/}"
  finished="$(now_ms)"
  printf '%s\t%s\t%s\n' "$name" "$((finished - started))" "${screenshot#$root_dir/}" >> "$metrics_file"
}

echo "[1/7] 完整测试"
npm test

echo "[2/7] 类型检查"
npm run typecheck

echo "[3/7] 正式构建"
npm run build

echo "[4/7] 签名打包"
npm run package:mac-arm64
require_file "$root_dir/outputs/炉石记牌器-mac-arm64.zip"

echo "[5/7] 代表性日志回放与窗口截图"
run_capture normal-replay fixtures/logs/session-2026-07-10
run_capture auto-match-replay fixtures/logs/auto-match-session
run_capture arena-replay fixtures/logs/arena-session
run_capture deck-overlay fixtures/logs/session-2026-07-10 QA_OPEN_OVERLAY
run_capture opponent-overlay fixtures/logs/session-2026-07-10 QA_OPEN_OPPONENT_OVERLAY
run_capture arena-choice-overlay fixtures/logs/arena-session QA_OPEN_ARENA_CHOICE_OVERLAY
run_capture ladder-deck-overlay fixtures/logs/session-2026-07-10 QA_OPEN_LADDER_DECK_OVERLAY
run_capture board-attack-overlay fixtures/logs/session-2026-07-10 QA_OPEN_BOARD_ATTACK_OVERLAY

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
env \
  QA_ALLOW_MULTIPLE_INSTANCES=1 \
  QA_USER_DATA_DIR="$evidence_dir/user-data/launch-check" \
  "$app_executable" >/dev/null 2>&1 &
launched_pid=$!
sleep 4
if ! kill -0 "$launched_pid" 2>/dev/null; then
  echo "安装包未成功启动" >&2
  exit 1
fi
kill "$launched_pid" 2>/dev/null || true

printf 'idle-listening\tmanual\t打包应用连续空闲 5 分钟后用活动监视器记录\n' >> "$metrics_file"
printf 'high-frequency-log\tautomated\t日志并发、截断与会话切换回归测试通过\n' >> "$metrics_file"

echo "发布验证通过。证据保存在：$evidence_dir"

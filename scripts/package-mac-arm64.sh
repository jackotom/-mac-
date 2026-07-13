#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
output_dir="$root_dir/outputs"
stage_dir="$output_dir/.mac-arm64-stage"
publish_dir="$output_dir/.mac-arm64-publish"
publish_app="$publish_dir/炉石记牌器.app"
publish_zip="$output_dir/.炉石记牌器-mac-arm64.next.zip"
target_app="$output_dir/炉石记牌器.app"
target_zip="$output_dir/炉石记牌器-mac-arm64.zip"

cleanup() {
  rm -rf "$stage_dir" "$publish_dir"
  rm -f "$publish_zip"
}

trap cleanup EXIT
rm -rf "$stage_dir" "$publish_dir"
rm -f "$publish_zip"
mkdir -p "$publish_dir"

for stale_path in "$output_dir"/release-* "$output_dir"/炉石记牌器\ *.app "$output_dir"/炉石记牌器-darwin-*; do
  if [[ -e "$stale_path" ]]; then
    rm -rf "$stale_path"
  fi
done
rm -f "$output_dir"/炉石记牌器-mac-arm64-v*.zip

if [[ ! -x "$root_dir/native/bin/arena-ocr" ]]; then
  echo "竞技场识别组件未构建" >&2
  exit 1
fi
if [[ ! -x "$root_dir/native/bin/frontmost-app" ]]; then
  echo "前台应用识别组件未构建" >&2
  exit 1
fi

npx --offline @electron/packager "$root_dir" "炉石记牌器" \
  --platform=darwin \
  --arch=arm64 \
  --out="$stage_dir" \
  --overwrite \
  --asar \
  --app-bundle-id="cc.acyg.hearthstonemactracker" \
  --helper-bundle-id="cc.acyg.hearthstonemactracker.helper" \
  --extra-resource="$root_dir/native/bin/arena-ocr" \
  --extra-resource="$root_dir/native/bin/frontmost-app" \
  --ignore='^/outputs($|/)'

ditto "$stage_dir/炉石记牌器-darwin-arm64/炉石记牌器.app" "$publish_app"
info_plist="$publish_app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :NSScreenCaptureUsageDescription 仅用于在炉石传说界面自动识别当前模式、套牌和竞技场候选牌，画面不会上传。" "$info_plist" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Add :NSScreenCaptureUsageDescription string 仅用于在炉石传说界面自动识别当前模式、套牌和竞技场候选牌，画面不会上传。" "$info_plist"
signing_identity="${CODESIGN_IDENTITY:-$(security find-identity -v -p codesigning | sed -n 's/.*"\(Apple Development:[^"]*\)".*/\1/p' | head -n 1)}"
if [[ -z "$signing_identity" ]]; then
  echo "没有找到可用的 Apple Development 签名证书" >&2
  exit 1
fi
codesign --force --deep --sign "$signing_identity" "$publish_app"
codesign --force --sign "$signing_identity" \
  --identifier "cc.acyg.hearthstonemactracker.arena-ocr" \
  "$publish_app/Contents/Resources/arena-ocr"
codesign --force --sign "$signing_identity" \
  --identifier "cc.acyg.hearthstonemactracker.frontmost-app" \
  "$publish_app/Contents/Resources/frontmost-app"
codesign --force --sign "$signing_identity" "$publish_app"
plutil -extract NSScreenCaptureUsageDescription raw "$info_plist" >/dev/null
codesign --verify --deep --strict "$publish_app"

ditto -c -k --sequesterRsrc --keepParent "$publish_app" "$publish_zip"

rm -rf "$target_app"
mv "$publish_app" "$target_app"
rm -f "$target_zip"
mv "$publish_zip" "$target_zip"

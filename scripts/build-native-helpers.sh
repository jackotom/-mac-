#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "$0")/.." && pwd)"
output_dir="$root_dir/native/bin"

mkdir -p "$output_dir"
swiftc -O -o "$output_dir/arena-ocr" "$root_dir/native/arena-ocr.swift"
swiftc -O -o "$output_dir/frontmost-app" "$root_dir/native/frontmost-app.swift"
chmod 755 "$output_dir/arena-ocr" "$output_dir/frontmost-app"

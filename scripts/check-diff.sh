#!/usr/bin/env bash
base="${1:-HEAD~1}"
echo "== files changed"; git diff --stat "$base"
echo "== suspicious additions (expect: none)"
git diff "$base" -- . ':!*.md' ':!scripts/check-diff.sh' | grep -nE '^\+.*(@ts-ignore|@ts-expect-error|as any|eslint-disable|\.skip\(|\.only\(|\bxit\(|it\.todo|test\.todo)' || echo none
echo "== test files with deleted lines (expect: nothing)"
git diff --numstat "$base" -- '*.test.ts' | awk '$2>0'

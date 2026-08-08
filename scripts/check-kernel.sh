#!/usr/bin/env bash
# check-kernel.sh — 内核法则 L1/L3/L11/L12 的机械检查（ideal_design.md §6、§12）
#
# 只做四件事，都可机械检验：
#   L1  story 写盘点棘轮：saveSetting(/saveGame( 调用点逐文件计数，
#       与白名单 scripts/kernel-l1-allowlist.tsv 精确比对。
#   L3  reduce 路径非确定性棘轮：§5 清单文件中的 Date.now/Math.random
#       逐文件计数，与 scripts/kernel-l3-allowlist.tsv 精确比对。
#   L11 数据库迁移注册表棘轮：dbService.ts 中 MIGRATIONS 的 version 条目数
#       与 scripts/kernel-l11-allowlist.tsv 精确比对。
#   L12 封版剥离守卫棘轮（片 5e，D4）：检查点写入路径
#       （commitTurn.ts / saveLoadWorkflow.ts）中禁止出现 queueTasks 对象字面量
#       属性发射（`queueTasks:`）与 newest.story 整体展开（`...newest.story`），
#       计数与 scripts/kernel-l12-allowlist.tsv 精确比对（恒为 0）。
#
# 棘轮语义：计数多一处（新增绕过点）或少一处（白名单腐烂）都算失败；
# 拆掉绕过点后必须把白名单计数调低，数字只许减不许增。
# 防腐烂：本脚本已做过植入违规验证（2026-07-23）；片 7 须复验一次。
#
# 不做的事（诚实边界）：import 关系层面的 L1 归 lint 的 no-restricted-imports
# （片 5 配置）；原地修改归 lint 的 no-param-reassign；L2/L4/L5 是运行时
# 与逐字段核对，脚本管不了。L12 的运行时兜底见 saveLoadWorkflow.ts 的
# assertCheckpointPayloadNoQueueTasks（saveGame 写入前的断言）。
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

check_ratchet() {
  local name="$1" allowlist="$2" current="$3"
  if ! diff <(printf '%s\n' "$current") "$allowlist" > /tmp/check-kernel-diff.$$; then
    echo "KERNEL $name VIOLATION（白名单与现状不符，diff <实际 >白名单）："
    cat /tmp/check-kernel-diff.$$
    rm -f /tmp/check-kernel-diff.$$
    return 1
  fi
  rm -f /tmp/check-kernel-diff.$$
  return 0
}

# --- L1：story 写盘点（dbService=提交实现、workflowRecovery=journal 合法旁路，豁免）---
l1_current=$(grep -rnE 'saveSetting\(|saveGame\(' \
    --include='*.ts' --include='*.tsx' \
    hooks utils models components services App.tsx \
  | grep -vE 'services/(dbService|workflowRecovery)\.ts' \
  | cut -d: -f1 | sort | uniq -c | awk '{print $2"\t"$1}' | sort) || true
check_ratchet "L1" scripts/kernel-l1-allowlist.tsv "$l1_current" || fail=1

# --- L3：reduce 路径非确定性源（ideal_design.md §5 清单文件）---
l3_files=(
  utils/variableExecutor.ts
  utils/variableFacts.ts
  models/inventory.ts
  models/npc.ts
  models/phone.ts
  models/zhiku.ts
)
l3_current=$({ grep -cE 'Date\.now|Math\.random' "${l3_files[@]}" || true; } \
  | awk -F: '{print $1"\t"$2}')
check_ratchet "L3" scripts/kernel-l3-allowlist.tsv "$l3_current" || fail=1

# --- L11：迁移注册表条目数（每个 version 条目独占一行）---
l11_current=$(grep -oE 'version: [0-9]+' services/dbService.ts | wc -l | awk '{print "services/dbService.ts\t"$1}')
check_ratchet "L11" scripts/kernel-l11-allowlist.tsv "$l11_current" || fail=1

# --- L12：封版剥离守卫（片 5e，D4）——检查点写入路径不得发射 queueTasks /
#    不得整体展开 newest.story（会把工作区专属字段折入检查点载荷）---
l12_files=(
  hooks/useGame/commitTurn.ts
  hooks/useGame/saveLoadWorkflow.ts
)
l12_current=$({ grep -cE 'queueTasks:|\.\.\.newest\.story' "${l12_files[@]}" || true; } \
  | awk -F: '{print $1"\t"$2}')
check_ratchet "L12" scripts/kernel-l12-allowlist.tsv "$l12_current" || fail=1

if [ "$fail" -ne 0 ]; then
  echo "check-kernel: FAILED"
  exit 1
fi
echo "check-kernel: OK (L1/L3/L11/L12 棘轮与白名单一致)"

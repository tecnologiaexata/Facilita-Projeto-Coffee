#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${REPO_ROOT}/logs"
BOOT_LOG="${LOG_DIR}/vast-onstart.log"

mkdir -p "${LOG_DIR}"

{
  printf '\n[%s] vast onstart iniciado\n' "$(date --iso-8601=seconds)"
  bash "${REPO_ROOT}/scripts/workerctl.sh" start
  printf '[%s] vast onstart concluido\n' "$(date --iso-8601=seconds)"
} >>"${BOOT_LOG}" 2>&1

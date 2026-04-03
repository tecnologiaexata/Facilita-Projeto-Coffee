#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENV_DIR="${REPO_ROOT}/.venv"
LOG_DIR="${REPO_ROOT}/logs"
RUN_DIR="${REPO_ROOT}/run"
PID_FILE="${RUN_DIR}/worker.pid"
REQUIREMENTS_FILE="${REPO_ROOT}/backend/requirements.txt"
REQUIREMENTS_STAMP="${VENV_DIR}/.requirements.sha256"
ENV_FILE="${REPO_ROOT}/.env"

log() {
  printf '[facilita-worker] %s\n' "$*"
}

fail() {
  printf '[facilita-worker] erro: %s\n' "$*" >&2
  exit 1
}

ensure_dirs() {
  mkdir -p "${LOG_DIR}" "${RUN_DIR}"
}

load_env() {
  if [[ -f "${ENV_FILE}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
    set +a
  fi
}

worker_host() {
  printf '%s' "${HOST:-0.0.0.0}"
}

worker_port() {
  printf '%s' "${PORT:-8050}"
}

worker_log_file() {
  printf '%s' "${LOG_DIR}/worker.log"
}

is_running() {
  if [[ ! -f "${PID_FILE}" ]]; then
    return 1
  fi

  local pid
  pid="$(cat "${PID_FILE}")"
  if [[ -z "${pid}" ]]; then
    return 1
  fi

  if kill -0 "${pid}" >/dev/null 2>&1; then
    return 0
  fi

  rm -f "${PID_FILE}"
  return 1
}

requirements_hash() {
  sha256sum "${REQUIREMENTS_FILE}" | awk '{print $1}'
}

ensure_venv() {
  if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
    log "criando ambiente virtual em ${VENV_DIR}"
    python3 -m venv "${VENV_DIR}" || fail "nao foi possivel criar .venv. Instale python3-venv."
  fi
}

ensure_dependencies() {
  ensure_venv

  local current_hash=""
  current_hash="$(requirements_hash)"
  local installed_hash=""
  if [[ -f "${REQUIREMENTS_STAMP}" ]]; then
    installed_hash="$(cat "${REQUIREMENTS_STAMP}")"
  fi

  if [[ "${current_hash}" == "${installed_hash}" ]]; then
    log "dependencias ja estao sincronizadas"
    return
  fi

  log "instalando dependencias Python"
  "${VENV_DIR}/bin/python" -m pip install --upgrade pip setuptools wheel
  "${VENV_DIR}/bin/pip" install -r "${REQUIREMENTS_FILE}"
  printf '%s' "${current_hash}" > "${REQUIREMENTS_STAMP}"
}

wait_for_health() {
  load_env

  local host port url
  host="$(worker_host)"
  port="$(worker_port)"
  url="http://127.0.0.1:${port}/api/health"

  for _ in $(seq 1 30); do
    if curl --silent --fail "${url}" >/dev/null 2>&1; then
      log "worker respondeu em ${url}"
      return 0
    fi
    sleep 1
  done

  fail "worker nao respondeu em ${url} dentro do tempo esperado"
}

start_worker() {
  ensure_dirs
  load_env

  [[ -f "${ENV_FILE}" ]] || fail "arquivo .env nao encontrado em ${REPO_ROOT}"

  if is_running; then
    log "worker ja esta rodando com pid $(cat "${PID_FILE}")"
    return 0
  fi

  ensure_dependencies

  local logfile host port
  logfile="$(worker_log_file)"
  host="$(worker_host)"
  port="$(worker_port)"

  log "subindo worker em ${host}:${port}"
  (
    cd "${REPO_ROOT}"
    nohup "${VENV_DIR}/bin/python" "${REPO_ROOT}/run_worker.py" --host "${host}" --port "${port}" >>"${logfile}" 2>&1 &
    echo $! > "${PID_FILE}"
  )

  wait_for_health
  log "worker iniciado com pid $(cat "${PID_FILE}")"
}

stop_worker() {
  if ! is_running; then
    log "worker nao esta rodando"
    return 0
  fi

  local pid
  pid="$(cat "${PID_FILE}")"
  log "parando worker pid ${pid}"
  kill "${pid}" >/dev/null 2>&1 || true

  for _ in $(seq 1 20); do
    if ! kill -0 "${pid}" >/dev/null 2>&1; then
      rm -f "${PID_FILE}"
      log "worker parado"
      return 0
    fi
    sleep 1
  done

  log "encerrando worker com kill -9"
  kill -9 "${pid}" >/dev/null 2>&1 || true
  rm -f "${PID_FILE}"
}

status_worker() {
  load_env

  if is_running; then
    local pid
    pid="$(cat "${PID_FILE}")"
    log "worker rodando com pid ${pid}"
    printf 'host=%s port=%s log=%s\n' "$(worker_host)" "$(worker_port)" "$(worker_log_file)"
    return 0
  fi

  log "worker parado"
}

tail_logs() {
  ensure_dirs
  touch "$(worker_log_file)"
  tail -n 100 -f "$(worker_log_file)"
}

health_worker() {
  load_env
  curl --silent --fail "http://127.0.0.1:$(worker_port)/api/health"
  printf '\n'
}

restart_worker() {
  stop_worker
  start_worker
}

usage() {
  cat <<'EOF'
Uso:
  bash scripts/workerctl.sh bootstrap
  bash scripts/workerctl.sh start
  bash scripts/workerctl.sh stop
  bash scripts/workerctl.sh restart
  bash scripts/workerctl.sh status
  bash scripts/workerctl.sh health
  bash scripts/workerctl.sh logs

Comportamento:
  - le o .env na raiz do projeto
  - cria .venv automaticamente se necessario
  - instala dependencias se backend/requirements.txt mudou
  - sobe run_worker.py em background e guarda pid em run/worker.pid
EOF
}

main() {
  local command="${1:-}"
  case "${command}" in
    bootstrap)
      ensure_dirs
      load_env
      ensure_dependencies
      ;;
    start)
      start_worker
      ;;
    stop)
      stop_worker
      ;;
    restart)
      restart_worker
      ;;
    status)
      status_worker
      ;;
    health)
      health_worker
      ;;
    logs)
      tail_logs
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"

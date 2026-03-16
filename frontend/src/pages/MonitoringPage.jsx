import { useEffect, useState } from "react";
import { getMonitoring } from "../lib/api";

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toFixed(1)}%`;
}

function formatMb(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toFixed(1)} MB`;
}

function formatSeconds(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const totalSeconds = Math.max(0, Math.floor(Number(value)));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function MonitoringStat({ label, value, tone = "" }) {
  return (
    <article className={`stat-card${tone ? ` stat-card--${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function UsageBar({ label, percent, detail, tone = "cpu" }) {
  const safePercent = Math.max(0, Math.min(100, Number(percent || 0)));
  return (
    <div className="usage-bar">
      <div className="usage-bar__header">
        <span>{label}</span>
        <strong>{formatPercent(safePercent)}</strong>
      </div>
      <div className="usage-bar__track">
        <div
          className={`usage-bar__fill usage-bar__fill--${tone}`}
          style={{ width: `${safePercent}%` }}
        />
      </div>
      <small>{detail}</small>
    </div>
  );
}

function TaskCard({ item }) {
  return (
    <article className="task-card">
      <header className="task-card__header">
        <div>
          <strong>{item.label}</strong>
          <small>{item.kind}</small>
        </div>
        <span className={`task-badge task-badge--${item.status}`}>{item.status}</span>
      </header>
      <div className="task-card__grid">
        <div>
          <span>Fase</span>
          <strong>{item.phase}</strong>
        </div>
        <div>
          <span>Tempo</span>
          <strong>{formatSeconds(item.elapsed_seconds)}</strong>
        </div>
        <div>
          <span>CPU da tarefa</span>
          <strong>{formatPercent(item.estimated_cpu_percent)}</strong>
        </div>
        <div>
          <span>CPU time</span>
          <strong>{item.cpu_time_seconds?.toFixed?.(2) ?? item.cpu_time_seconds}s</strong>
        </div>
        <div>
          <span>RSS do processo</span>
          <strong>{formatMb(item.process_rss_mb)}</strong>
        </div>
        <div>
          <span>Delta memoria</span>
          <strong>{formatMb(item.memory_delta_mb)}</strong>
        </div>
      </div>
      {item.metadata && Object.keys(item.metadata).length > 0 && (
        <div className="task-card__meta">
          {Object.entries(item.metadata).map(([key, value]) => (
            <span key={key}>
              {key}: {String(value)}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function RecentTaskRow({ item }) {
  return (
    <div className="recent-task-row">
      <div>
        <strong>{item.label}</strong>
        <small>{item.kind}</small>
      </div>
      <span>{item.phase}</span>
      <span>{formatSeconds(item.elapsed_seconds)}</span>
      <span>{formatMb(item.memory_delta_mb)}</span>
      <span className={`task-badge task-badge--${item.status}`}>{item.status}</span>
    </div>
  );
}

export default function MonitoringPage() {
  const [monitoring, setMonitoring] = useState(null);
  const [status, setStatus] = useState({ kind: "idle", message: "Aguardando primeira leitura..." });

  useEffect(() => {
    let cancelled = false;

    async function readMonitoring() {
      try {
        const payload = await getMonitoring();
        if (cancelled) return;
        setMonitoring(payload);
        setStatus({ kind: "success", message: "Monitoramento atualizado automaticamente a cada 2s." });
      } catch (error) {
        if (cancelled) return;
        setStatus({ kind: "error", message: error.message });
      }
    }

    readMonitoring();
    const timer = window.setInterval(readMonitoring, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const server = monitoring?.server;
  const gpu = server?.gpu;
  const tasks = monitoring?.tasks;

  return (
    <section className="stack">
      <div className="panel">
        <div className="panel__header">
          <p className="eyebrow">Observabilidade</p>
          <h2>Monitoramento do servidor em tempo real.</h2>
          <p>
            Este painel mostra tarefas em execucao no backend, consumo estimado por
            tarefa e uso total de CPU, GPU e memoria do servidor onde a API esta rodando.
          </p>
        </div>

        <div className={`status status--${status.kind}`}>{status.message}</div>

        <div className="stats-grid">
          <MonitoringStat label="CPU total" value={formatPercent(server?.cpu?.total_percent)} />
          <MonitoringStat label="Memoria total" value={formatPercent(server?.memory?.percent)} />
          <MonitoringStat
            label="GPU total"
            value={gpu?.available ? formatPercent(gpu.total_utilization_percent) : "Indisponivel"}
            tone={!gpu?.available ? "muted" : ""}
          />
          <MonitoringStat label="Tarefas ativas" value={tasks?.active_count ?? 0} />
          <MonitoringStat label="Processo backend" value={formatPercent(server?.cpu?.process_percent)} />
          <MonitoringStat label="RSS backend" value={formatMb(server?.memory?.process_rss_mb)} />
        </div>
      </div>

      <div className="monitor-grid">
        <div className="panel">
          <div className="panel__header">
            <p className="eyebrow">Servidor</p>
            <h2>Uso consolidado do host e do processo da API.</h2>
          </div>

          <div className="usage-stack">
            <UsageBar
              label="CPU total"
              percent={server?.cpu?.total_percent}
              detail={`Processo backend: ${formatPercent(server?.cpu?.process_percent)} | cores: ${server?.cpu?.core_count ?? "-"}`}
              tone="cpu"
            />
            <UsageBar
              label="Memoria total"
              percent={server?.memory?.percent}
              detail={`Usado: ${formatMb(server?.memory?.used_mb)} | Disponivel: ${formatMb(server?.memory?.available_mb)}`}
              tone="memory"
            />
            <UsageBar
              label="GPU total"
              percent={gpu?.available ? gpu.memory_percent : 0}
              detail={
                gpu?.available
                  ? `Utilizacao media: ${formatPercent(gpu.total_utilization_percent)} | VRAM: ${formatMb(gpu.memory_used_mb)} / ${formatMb(gpu.memory_total_mb)}`
                  : gpu?.reason || "GPU nao detectada neste ambiente."
              }
              tone="gpu"
            />
          </div>

          <div className="monitor-meta">
            <span>Host: {server?.hostname || "-"}</span>
            <span>PID: {server?.pid || "-"}</span>
            <span>Uptime do processo: {formatSeconds(server?.uptime_seconds)}</span>
            <span>Leitura: {monitoring?.generated_at ? new Date(monitoring.generated_at).toLocaleString("pt-BR") : "-"}</span>
          </div>

          {gpu?.available && gpu.devices?.length ? (
            <div className="gpu-grid">
              {gpu.devices.map((device) => (
                <article key={device.index} className="gpu-card">
                  <strong>{device.name}</strong>
                  <span>GPU {device.index}</span>
                  <span>Uso: {formatPercent(device.utilization_percent)}</span>
                  <span>VRAM: {formatMb(device.memory_used_mb)} / {formatMb(device.memory_total_mb)}</span>
                  <span>Temp: {device.temperature_c} C</span>
                </article>
              ))}
            </div>
          ) : null}
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel__header">
              <p className="eyebrow">Em execucao</p>
              <h2>Tarefas correntes do backend.</h2>
            </div>

            {!tasks?.active?.length ? (
              <div className="empty-state">
                <p>Nenhuma tarefa em execucao neste momento.</p>
              </div>
            ) : (
              <div className="task-stack">
                {tasks.active.map((item) => (
                  <TaskCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel__header">
              <p className="eyebrow">Recentes</p>
              <h2>Ultimas tarefas observadas pelo backend.</h2>
            </div>

            {!tasks?.recent?.length ? (
              <div className="empty-state">
                <p>O historico recente aparecera aqui depois da primeira execucao relevante.</p>
              </div>
            ) : (
              <div className="recent-task-table">
                <div className="recent-task-row recent-task-row--head">
                  <span>Tarefa</span>
                  <span>Fase final</span>
                  <span>Tempo</span>
                  <span>Delta memoria</span>
                  <span>Status</span>
                </div>
                {tasks.recent.map((item) => (
                  <RecentTaskRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

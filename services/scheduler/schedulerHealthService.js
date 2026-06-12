const registry = new Map();

function nowIso() {
  return new Date().toISOString();
}

function registerScheduler({
  key,
  name,
  interval_ms = 300000,
  type = "worker",
} = {}) {
  if (!key) return;

  const current = registry.get(key) || {};

  registry.set(key, {
    key,
    name: name || key,
    type,
    interval_ms,
    status: "registered",
    registered_at: current.registered_at || nowIso(),
    started_at: current.started_at || null,
    last_tick_at: current.last_tick_at || null,
    last_success_at: current.last_success_at || null,
    last_error_at: current.last_error_at || null,
    last_error: current.last_error || null,
    run_count: current.run_count || 0,
    success_count: current.success_count || 0,
    error_count: current.error_count || 0,
  });
}

function markSchedulerStarted(key) {
  const item = registry.get(key);
  if (!item) return;

  item.status = "running";
  item.started_at = item.started_at || nowIso();
  item.last_tick_at = nowIso();
  registry.set(key, item);
}

function markSchedulerSuccess(key, detail = {}) {
  const item = registry.get(key);
  if (!item) return;

  item.status = "healthy";
  item.last_tick_at = nowIso();
  item.last_success_at = nowIso();
  item.last_error = null;
  item.run_count += 1;
  item.success_count += 1;
  item.detail = detail;
  registry.set(key, item);
}

function markSchedulerError(key, error) {
  const item = registry.get(key);
  if (!item) return;

  item.status = "error";
  item.last_tick_at = nowIso();
  item.last_error_at = nowIso();
  item.last_error = error?.message || String(error || "unknown_error");
  item.run_count += 1;
  item.error_count += 1;
  registry.set(key, item);
}

function getSchedulerHealth() {
  const now = Date.now();

  const schedulers = [...registry.values()].map(item => {
    const lastTickMs = item.last_tick_at
      ? new Date(item.last_tick_at).getTime()
      : 0;

    const staleMs = item.interval_ms * 3;
    const isStale = !lastTickMs || now - lastTickMs > staleMs;

    const health_status =
      item.status === "error"
        ? "critical"
        : isStale
          ? "warning"
          : "healthy";

    return {
      ...item,
      health_status,
      stale: isStale,
      seconds_since_last_tick: lastTickMs
        ? Math.floor((now - lastTickMs) / 1000)
        : null,
    };
  });

  const critical = schedulers.filter(s => s.health_status === "critical").length;
  const warning = schedulers.filter(s => s.health_status === "warning").length;

  return {
    status: critical > 0 ? "critical" : warning > 0 ? "warning" : "healthy",
    total: schedulers.length,
    critical,
    warning,
    healthy: schedulers.filter(s => s.health_status === "healthy").length,
    schedulers,
  };
}

module.exports = {
  registerScheduler,
  markSchedulerStarted,
  markSchedulerSuccess,
  markSchedulerError,
  getSchedulerHealth,
};

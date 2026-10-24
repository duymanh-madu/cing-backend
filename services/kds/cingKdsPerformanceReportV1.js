"use strict";

// Pure report and alert candidate generation.
// Server-authorized data only.
// No notifications, database writes or financial effects.

const TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function timestamp(value) {
  if (
    typeof value !== "string" ||
    !TIME_PATTERN.test(value)
  ) {
    throw new Error("KDS_TIMESTAMP_REQUIRED");
  }

  const ms = Date.parse(value);

  if (!Number.isFinite(ms)) {
    throw new Error("KDS_INVALID_TIMESTAMP");
  }

  return ms;
}

function branchKey(parent, posId) {
  const p = String(parent ?? "").trim();
  const id = String(posId ?? "").trim();

  if (!p || !/^[1-9]\d*$/.test(id)) {
    throw new Error("KDS_BRANCH_IDENTITY_REQUIRED");
  }

  return JSON.stringify([p, id]);
}

function percentile(sorted, fraction) {
  if (!sorted.length) return null;

  const index = Math.max(
    0,
    Math.ceil(sorted.length * fraction) - 1
  );

  return sorted[index];
}

function buildPerformanceReport({
  orders,
  allowC04Orders = false,
  policies,
  now,
  durationMin = null,
  durationMax = null
}) {
  if (!Array.isArray(orders) ||
      !Array.isArray(policies)) {
    throw new Error("KDS_REPORT_INPUT_REQUIRED");
  }

  const current = timestamp(now);

  for (const value of [durationMin, durationMax]) {
    if (
      value !== null &&
      (typeof value !== "number" ||
       !Number.isFinite(value) ||
       value < 0)
    ) {
      throw new Error("KDS_INVALID_DURATION_FILTER");
    }
  }

  if (
    durationMin !== null &&
    durationMax !== null &&
    durationMin > durationMax
  ) {
    throw new Error("KDS_INVALID_DURATION_RANGE");
  }

  const policyMap = new Map();

  for (const p of policies) {
    const key = branchKey(p.pos_parent, p.pos_id);

    if (policyMap.has(key)) {
      throw new Error("KDS_DUPLICATE_SLA_POLICY");
    }

    if (
      !Number.isSafeInteger(p.warning_minutes) ||
      !Number.isSafeInteger(p.critical_minutes) ||
      p.warning_minutes <= 0 ||
      p.critical_minutes <= p.warning_minutes
    ) {
      throw new Error("KDS_INVALID_SLA_POLICY");
    }

    policyMap.set(key, p);
  }

  const seen = new Set();
  const branches = new Map();
  const history = [];
  const activeAlerts = [];

  for (const order of orders) {
    if (
      (order.payment_verification !== "verified" && !(allowC04Orders && order.order_admission_verified === true)) ||
      order.ingestion_status !== "processed" ||
      order.conflict_status !== "clear"
    ) {
      continue;
    }

    const key = branchKey(
      order.pos_parent,
      order.pos_id
    );

    const id = String(order.id ?? "").trim();

    if (!id || seen.has(JSON.stringify([key, id]))) {
      throw new Error("KDS_DUPLICATE_ORDER");
    }

    seen.add(JSON.stringify([key, id]));

    const policy = policyMap.get(key);

    if (!policy) {
      throw new Error("KDS_SLA_POLICY_MISSING");
    }

    const started = timestamp(order.started_at);

    if (started > current) {
      throw new Error("KDS_FUTURE_ORDER");
    }

    if (
      !Array.isArray(order.cups) ||
      order.cups.length === 0
    ) {
      throw new Error("KDS_CUPS_REQUIRED");
    }

    const cupIds = new Set();
    let remaining = 0;
    let completedAt = started;

    for (const cup of order.cups) {
      const cupId = String(cup.id ?? "").trim();

      if (!cupId || cupIds.has(cupId)) {
        throw new Error("KDS_DUPLICATE_CUP");
      }

      cupIds.add(cupId);

      if (cup.status === "served") {
        const servedAt = timestamp(cup.served_at);

        if (
          servedAt < started ||
          servedAt > current
        ) {
          throw new Error("KDS_INVALID_SERVED_TIME");
        }

        completedAt = Math.max(
          completedAt,
          servedAt
        );
      } else if ([
        "pending", "preparing", "prepared"
      ].includes(cup.status)) {
        remaining++;
      } else {
        throw new Error("KDS_INVALID_CUP_STATUS");
      }
    }

    const completed = remaining === 0;
    const elapsed = (
      (completed ? completedAt : current) - started
    ) / 60000;

    const severity =
      elapsed >= policy.critical_minutes
        ? "critical"
        : elapsed >= policy.warning_minutes
          ? "warning"
          : "normal";

    if (!branches.has(key)) {
      branches.set(key, {
        pos_parent: String(order.pos_parent),
        pos_id: String(order.pos_id),
        completed_orders: 0,
        active_orders: 0,
        overdue_active_orders: 0,
        completed_over_sla: 0,
        durations: []
      });
    }

    const branch = branches.get(key);

    if (completed) {
      branch.completed_orders++;
      branch.durations.push(elapsed);

      if (severity !== "normal") {
        branch.completed_over_sla++;
      }

      // Duration filtering applies to completed
      // orders only, never hides live alerts.
      if (
        (durationMin === null ||
         elapsed >= durationMin) &&
        (durationMax === null ||
         elapsed <= durationMax)
      ) {
        history.push({
          order_id: id,
          pos_parent: branch.pos_parent,
          pos_id: branch.pos_id,
          started_at: order.started_at,
          completed_at:
            new Date(completedAt).toISOString(),
          duration_minutes: elapsed,
          sla_severity: severity,
          cup_count: order.cups.length
        });
      }

    } else {
      branch.active_orders++;

      if (
        severity !== "normal" &&
        policy.enabled === true
      ) {
        branch.overdue_active_orders++;

        activeAlerts.push({
          order_id: id,
          pos_parent: branch.pos_parent,
          pos_id: branch.pos_id,
          severity,
          elapsed_minutes: elapsed,
          remaining_cups: remaining,
          // Deterministic decision identity.
          // Durable dedup belongs in PostgreSQL.
          alert_key: JSON.stringify([
            key, id, severity
          ])
        });
      }
    }
  }

  const summaries = [...branches.values()].map(b => {
    const durations = [...b.durations]
      .sort((a, c) => a - c);

    return {
      pos_parent: b.pos_parent,
      pos_id: b.pos_id,
      completed_orders: b.completed_orders,
      active_orders: b.active_orders,
      overdue_active_orders:
        b.overdue_active_orders,
      completed_over_sla: b.completed_over_sla,
      avg_minutes: durations.length
        ? durations.reduce((a, c) => a + c, 0) /
          durations.length
        : null,
      median_minutes: percentile(durations, 0.5),
      p90_minutes: percentile(durations, 0.9),
      p95_minutes: percentile(durations, 0.95)
    };
  });

  summaries.sort((a, b) =>
    branchKey(a.pos_parent, a.pos_id).localeCompare(
      branchKey(b.pos_parent, b.pos_id)
    )
  );

  history.sort((a, b) =>
    b.completed_at.localeCompare(a.completed_at)
  );

  activeAlerts.sort((a, b) =>
    b.elapsed_minutes - a.elapsed_minutes ||
    a.alert_key.localeCompare(b.alert_key)
  );

  return {
    branches: summaries,
    completed_history: history,
    active_alert_candidates: activeAlerts
  };
}

module.exports = { buildPerformanceReport };

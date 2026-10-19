"use strict";

// Pure read model: no database mutation, no event emission.
// Input is a trusted, authorized server-side projection.
// Client-supplied payment status is not an authority.

function epoch(value, field) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)
  ) {
    throw new Error(`KDS_INVALID_${field}`);
  }

  const result = Date.parse(value);

  if (!Number.isFinite(result)) {
    throw new Error(`KDS_INVALID_${field}`);
  }

  return result;
}

function positiveMinutes(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`KDS_INVALID_${field}`);
  }
  return value;
}

function buildOperationsReadModel({
  orders,
  now,
  warningMinutes,
  criticalMinutes,
  posId = null,
  group = null
}) {
  if (!Array.isArray(orders)) {
    throw new Error("KDS_ORDERS_REQUIRED");
  }

  const currentTime = epoch(now, "NOW");
  const warning = positiveMinutes(
    warningMinutes, "WARNING"
  );
  const critical = positiveMinutes(
    criticalMinutes, "CRITICAL"
  );

  if (critical <= warning) {
    throw new Error("KDS_INVALID_SLA_POLICY");
  }

  const queue = [];
  const history = [];
  const groupCounts = new Map();
  const seenOrders = new Set();
  const seenCups = new Set();

  for (const order of orders) {
    if (!order || typeof order !== "object") {
      throw new Error("KDS_INVALID_ORDER");
    }

    // This gate is read-only, NOT payment verification.
    if (
      order.payment_verification !== "verified" ||
      order.ingestion_status !== "processed" ||
      order.conflict_status !== "clear"
    ) {
      continue;
    }

    if (
      posId !== null &&
      String(order.pos_id) !== String(posId)
    ) {
      continue;
    }

    const orderId = String(order.id || "");
    const branchId = String(order.pos_id || "");
    const started = epoch(
      order.started_at, "ORDER_STARTED_AT"
    );

    if (!orderId || !branchId || seenOrders.has(orderId)) {
      throw new Error("KDS_INVALID_ORDER_IDENTITY");
    }
    seenOrders.add(orderId);

    if (started > currentTime) {
      throw new Error("KDS_FUTURE_ORDER");
    }

    if (!Array.isArray(order.cups) ||
        order.cups.length === 0) {
      throw new Error("KDS_INVALID_CUPS");
    }

    let servedCount = 0;
    let lastServed = started;
    let hasUnserved = false;

    for (const cup of order.cups) {
      const cupId = String(cup.id || "");
      const status = cup.status;
      const itemGroup = String(
        cup.item_group || "Chưa phân nhóm"
      );

      if (!cupId || seenCups.has(cupId)) {
        throw new Error("KDS_INVALID_CUP_IDENTITY");
      }
      seenCups.add(cupId);

      if (![
        "pending", "preparing", "prepared", "served"
      ].includes(status)) {
        throw new Error("KDS_INVALID_CUP_STATUS");
      }

      if (status === "served") {
        const servedAt = epoch(
          cup.served_at, "SERVED_AT"
        );

        if (servedAt < started ||
            servedAt > currentTime) {
          throw new Error("KDS_INVALID_SERVICE_TIME");
        }

        servedCount++;
        lastServed = Math.max(lastServed, servedAt);
        continue;
      }

      hasUnserved = true;
      const elapsedMinutes =
        (currentTime - started) / 60000;

      const severity =
        elapsedMinutes >= critical ? "critical" :
        elapsedMinutes >= warning ? "warning" :
        "normal";

      const entry = {
        order_id: orderId,
        cup_id: cupId,
        pos_id: branchId,
        tran_no: String(order.tran_no || ""),
        item_name: String(cup.item_name || ""),
        item_group: itemGroup,
        status,
        started_at: order.started_at,
        elapsed_minutes: elapsedMinutes,
        severity
      };

      // All unserved cups count toward open-order SLA.
      // Prepared cups are listed separately for serving.
      if (group === null || itemGroup === group) {
        queue.push(entry);
      }

      const key = `${branchId}\u0000${itemGroup}`;
      const current = groupCounts.get(key) || {
        pos_id: branchId,
        item_group: itemGroup,
        pending: 0,
        preparing: 0,
        prepared: 0,
        total_unserved: 0
      };

      current[status]++;
      current.total_unserved++;
      groupCounts.set(key, current);
    }

    if (!hasUnserved && servedCount === order.cups.length) {
      history.push({
        order_id: orderId,
        pos_id: branchId,
        tran_no: String(order.tran_no || ""),
        started_at: order.started_at,
        completed_at: new Date(lastServed).toISOString(),
        duration_minutes: (lastServed - started) / 60000,
        cup_count: servedCount
      });
    }
  }

  const byTime = (a, b) =>
    epoch(a.started_at, "ORDER_STARTED_AT") -
      epoch(b.started_at, "ORDER_STARTED_AT") ||
    a.order_id.localeCompare(b.order_id) ||
    a.cup_id.localeCompare(b.cup_id);

  queue.sort(byTime);

  history.sort((a, b) =>
    epoch(b.completed_at, "COMPLETED_AT") -
    epoch(a.completed_at, "COMPLETED_AT")
  );

  return {
    queue,
    preparation_queue:
      queue.filter(x =>
        x.status === "pending" ||
        x.status === "preparing"
      ),
    serving_queue:
      queue.filter(x => x.status === "prepared"),
    group_counts: [...groupCounts.values()]
      .sort((a, b) =>
        a.pos_id.localeCompare(b.pos_id) ||
        a.item_group.localeCompare(b.item_group)
      ),
    completed_orders: history,
    overdue_orders: [...new Map(
      queue.filter(x => x.severity !== "normal")
        .map(x => [x.order_id, x])
    ).values()]
  };
}

module.exports = { buildOperationsReadModel };

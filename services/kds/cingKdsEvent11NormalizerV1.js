"use strict";

function required(value, name) {
  const result = String(value ?? "").trim();

  if (!result) {
    throw new Error(`KDS_REQUIRED_${name}`);
  }

  return result;
}

function positiveInteger(value, name) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`KDS_INVALID_${name}`);
  }

  return number;
}

function normalizeEvent11(body) {
  if (
    !body ||
    body.event_id !== 11 ||
    body.event !== "sale_manager" ||
    !body.sale_manager ||
    typeof body.sale_manager !== "object" ||
    Array.isArray(body.sale_manager)
  ) {
    throw new Error("KDS_NOT_EVENT_11");
  }

  const sale = body.sale_manager;

  const posParent = required(sale.pos_parent, "POS_PARENT");
  const posId = positiveInteger(sale.pos_id, "POS_ID");
  const tranId = required(sale.tran_id, "TRAN_ID");

  if (!Array.isArray(sale.items) || !sale.items.length) {
    throw new Error("KDS_ITEMS_REQUIRED");
  }

  const cups = [];
  let totalQuantity = 0;

  sale.items.forEach((item, lineIndex) => {
    if (!item || typeof item !== "object") {
      throw new Error("KDS_INVALID_ITEM");
    }

    const itemId = required(item.item_id, "ITEM_ID");
    const itemName = required(item.item_name, "ITEM_NAME");
    const quantity = positiveInteger(
      item.quantity,
      "ITEM_QUANTITY"
    );

    totalQuantity += quantity;

    if (totalQuantity > 1000) {
      throw new Error("KDS_QUANTITY_LIMIT");
    }

    for (let unit = 0; unit < quantity; unit++) {
      cups.push({
        unit_key: `${lineIndex}:${unit}`,
        line_index: lineIndex,
        unit_index: unit,
        item_id: itemId,
        item_name: itemName,
        status: "pending"
      });
    }
  });

  const timestamp = Number(body.timestamp);

  const eventTime =
    Number.isSafeInteger(timestamp) &&
    timestamp > 0 &&
    Number.isFinite(new Date(timestamp).getTime())
      ? new Date(timestamp).toISOString()
      : null;

  return {
    source: "ipos_event_11",
    source_event_id: sale.id
      ? String(sale.id)
      : null,

    pos_parent: posParent,
    pos_id: posId,
    pos_name: String(sale.pos_name || ""),
    tran_id: tranId,
    tran_no: String(sale.tran_no || ""),

    // POS timestamps are kept verbatim until the
    // source timezone and semantics are verified.
    tran_date_raw: sale.tran_date || null,
    hub_created_at_raw: sale.created_at || null,
    event_timestamp: eventTime,

    // Never infer confirmed payment from event name
    // or payment_info alone.
    payment_verification: "pending_verification",

    total_cups: cups.length,
    cups
  };
}

module.exports = { normalizeEvent11 };

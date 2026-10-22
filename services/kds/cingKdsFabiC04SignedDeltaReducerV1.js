"use strict";

const crypto = require("node:crypto");

const INPUT_SCHEMA =
  "cing_kds_fabi_c04_event_v1";

const OUTPUT_SCHEMA =
  "cing_kds_fabi_c04_state_v1";

function invalid(path, reason = "") {
  const suffix =
    reason ? `.${reason}` : "";

  const error =
    new Error(
      `C04_STATE_INVALID:${path}${suffix}`
    );

  error.code =
    "C04_STATE_INVALID";

  throw error;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function requiredObject(value, path) {
  if (!isPlainObject(value)) {
    invalid(path, "object_required");
  }

  return value;
}

function requiredArray(value, path) {
  if (!Array.isArray(value)) {
    invalid(path, "array_required");
  }

  return value;
}

function requiredString(value, path) {
  if (
    typeof value !== "string" ||
    value.length === 0
  ) {
    invalid(path, "string_required");
  }

  return value;
}

function finiteNonZero(value, path) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number === 0
  ) {
    invalid(
      path,
      "nonzero_number_required"
    );
  }

  return number;
}

function deepFreeze(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  Object.freeze(value);

  for (
    const child
    of Object.values(value)
  ) {
    deepFreeze(child);
  }

  return value;
}

function stableClone(value) {
  if (Array.isArray(value)) {
    return value.map(stableClone);
  }

  if (isPlainObject(value)) {
    const out = {};

    for (
      const key
      of Object.keys(value).sort()
    ) {
      out[key] =
        stableClone(value[key]);
    }

    return out;
  }

  return value;
}

function fingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        stableClone(value)
      )
    )
    .digest("hex");
}

function authoritativeLineIdentity(line) {
  return {
    item_id:
      line.item_id,

    item_name:
      line.item_name,

    item_class_id:
      line.item_class_id,

    item_type_id:
      line.item_type_id,

    unit_id:
      line.unit_id ?? null,

    price:
      line.price ?? null,

    note:
      line.note ?? ""
  };
}

function authoritativeModifierIdentity(modifier) {
  return {
    item_id:
      modifier.item_id,

    item_name:
      modifier.item_name,

    item_class_id:
      modifier.item_class_id,

    item_type_id:
      modifier.item_type_id ?? null,

    unit_id:
      modifier.unit_id ?? null,

    note:
      modifier.note ?? ""
  };
}

function sameIdentity(a, b) {
  return (
    JSON.stringify(a) ===
    JSON.stringify(b)
  );
}

function validateNormalizedEvent(
  event,
  index
) {
  const path =
    `events[${index}]`;

  requiredObject(
    event,
    path
  );

  if (
    event.schema_version !==
    INPUT_SCHEMA
  ) {
    invalid(
      `${path}.schema_version`,
      "unsupported"
    );
  }

  if (
    ![
      "SALE_CHANGE",
      "SALE_MERGE_ORDER"
    ].includes(
      event.source_log_type
    )
  ) {
    invalid(
      `${path}.source_log_type`,
      "unsupported"
    );
  }

  requiredString(
    event.tran_id,
    `${path}.tran_id`
  );

  requiredString(
    event.event_fingerprint,
    `${path}.event_fingerprint`
  );

  requiredArray(
    event.lines,
    `${path}.lines`
  );

  if (
    event.lines.length === 0
  ) {
    invalid(
      `${path}.lines`,
      "empty"
    );
  }

  if (
    !isPlainObject(
      event.semantics
    ) ||
    event.semantics
      .quantity_model !==
      "signed_delta" ||
    event.semantics
      .payment_authority !==
      false ||
    event.semantics
      .final_state_authority !==
      false
  ) {
    invalid(
      `${path}.semantics`,
      "authority_contract"
    );
  }

  const createdAt =
    Number(
      event.event_created_at
    );

  if (
    !Number.isFinite(createdAt)
  ) {
    invalid(
      `${path}.event_created_at`,
      "number_required"
    );
  }
}

function sortedUniqueEvents(events, eventClock) {
  const clocks = new Map();
  const seen =
    new Set();

  let replayed = 0;

  const unique = [];

  for (
    let index = 0;
    index < events.length;
    index++
  ) {
    const event =
      events[index];

    validateNormalizedEvent(
      event,
      index
    );

    if (eventClock) {
      const clock = eventClock(event);
      if (!clock || typeof clock.epoch_microseconds !== "string" ||
          !/^\d+$/.test(clock.epoch_microseconds)) {
        invalid(`events[${index}].clock`, "invalid");
      }
      const micros = BigInt(clock.epoch_microseconds);
      if (micros / 1000n > BigInt(Number.MAX_SAFE_INTEGER)) {
        invalid(`events[${index}].clock`, "range");
      }
      clocks.set(event, micros);
    }

    if (
      seen.has(
        event.event_fingerprint
      )
    ) {
      replayed++;
      continue;
    }

    seen.add(
      event.event_fingerprint
    );

    unique.push(event);
  }

  unique.sort((a, b) => {
    if (eventClock) {
      const left = clocks.get(a);
      const right = clocks.get(b);
      if (left !== right) return left < right ? -1 : 1;
    }
    const createdDiff =
      Number(a.event_created_at) -
      Number(b.event_created_at);

    if (createdDiff !== 0) {
      return createdDiff;
    }

    const updatedDiff =
      Number(
        a.event_updated_at ?? 0
      ) -
      Number(
        b.event_updated_at ?? 0
      );

    if (updatedDiff !== 0) {
      return updatedDiff;
    }

    return a.event_fingerprint
      .localeCompare(
        b.event_fingerprint
      );
  });

  return {
    unique,
    replayed,
    clocks
  };
}

function applyModifier(
  lineEntry,
  modifier,
  path
) {
  requiredObject(
    modifier,
    path
  );

  const id =
    requiredString(
      modifier.canonical_line_id,
      `${path}.canonical_line_id`
    );

  const qty =
    finiteNonZero(
      modifier.quantity_delta,
      `${path}.quantity_delta`
    );

  const identity =
    authoritativeModifierIdentity(
      modifier
    );

  if (
    !lineEntry.modifiers.has(id)
  ) {
    lineEntry.modifiers.set(
      id,
      {
        canonical_line_id:
          id,

        raw_ids:
          new Set(),

        identity,

        net_quantity:
          0
      }
    );
  }

  const entry =
    lineEntry.modifiers.get(id);

  if (
    !sameIdentity(
      entry.identity,
      identity
    )
  ) {
    invalid(
      `${path}.canonical_line_id`,
      "modifier_identity_changed"
    );
  }

  entry.net_quantity +=
    qty;

  if (
    modifier.raw_id_sale_detail
  ) {
    entry.raw_ids.add(
      modifier.raw_id_sale_detail
    );
  }
}

function applyLine(
  ledger,
  line,
  path
) {
  requiredObject(
    line,
    path
  );

  const id =
    requiredString(
      line.canonical_line_id,
      `${path}.canonical_line_id`
    );

  const qty =
    finiteNonZero(
      line.quantity_delta,
      `${path}.quantity_delta`
    );

  const identity =
    authoritativeLineIdentity(
      line
    );

  if (!ledger.has(id)) {
    ledger.set(
      id,
      {
        canonical_line_id:
          id,

        raw_ids:
          new Set(),

        identity,

        net_quantity:
          0,

        positive_delta_total:
          0,

        negative_delta_total:
          0,

        modifiers:
          new Map()
      }
    );
  }

  const entry =
    ledger.get(id);

  if (
    !sameIdentity(
      entry.identity,
      identity
    )
  ) {
    invalid(
      `${path}.canonical_line_id`,
      "line_identity_changed"
    );
  }

  entry.net_quantity +=
    qty;

  if (qty > 0) {
    entry.positive_delta_total +=
      qty;
  } else {
    entry.negative_delta_total +=
      qty;
  }

  if (
    line.raw_id_sale_detail
  ) {
    entry.raw_ids.add(
      line.raw_id_sale_detail
    );
  }

  const toppings =
    requiredArray(
      line.toppings,
      `${path}.toppings`
    );

  for (
    let index = 0;
    index < toppings.length;
    index++
  ) {
    applyModifier(
      entry,
      toppings[index],
      `${path}.toppings[${index}]`
    );
  }
}

function finalizeModifier(
  modifier,
  linePath
) {
  if (
    modifier.net_quantity < 0
  ) {
    invalid(
      linePath,
      "modifier_final_negative"
    );
  }

  if (
    modifier.net_quantity === 0
  ) {
    return null;
  }

  return {
    canonical_line_id:
      modifier.canonical_line_id,

    raw_ids:
      [...modifier.raw_ids]
        .sort(),

    ...modifier.identity,

    quantity:
      modifier.net_quantity
  };
}

function finalizeLine(
  entry,
  path
) {
  if (
    entry.net_quantity < 0
  ) {
    invalid(
      path,
      "line_final_negative"
    );
  }

  const modifiers = [];

  for (
    const modifier
    of entry.modifiers.values()
  ) {
    const finalized =
      finalizeModifier(
        modifier,
        path
      );

    if (finalized) {
      modifiers.push(
        finalized
      );
    }
  }

  modifiers.sort(
    (a, b) =>
      a.canonical_line_id
        .localeCompare(
          b.canonical_line_id
        )
  );

  if (
    entry.net_quantity === 0
  ) {
    if (modifiers.length > 0) {
      invalid(
        path,
        "removed_line_has_active_modifier"
      );
    }

    return {
      active: false,

      ledger: {
        canonical_line_id:
          entry.canonical_line_id,

        raw_ids:
          [...entry.raw_ids]
            .sort(),

        ...entry.identity,

        net_quantity:
          0,

        positive_delta_total:
          entry.positive_delta_total,

        negative_delta_total:
          entry.negative_delta_total,

        modifiers: []
      }
    };
  }

  return {
    active: true,

    ledger: {
      canonical_line_id:
        entry.canonical_line_id,

      raw_ids:
        [...entry.raw_ids]
          .sort(),

      ...entry.identity,

      net_quantity:
        entry.net_quantity,

      positive_delta_total:
        entry.positive_delta_total,

      negative_delta_total:
        entry.negative_delta_total,

      modifiers
    }
  };
}

function projectFabiC04StateV1(events, { eventClock = null } = {}) {
  if (eventClock !== null && typeof eventClock !== "function") {
    invalid("eventClock", "function_required");
  }
  requiredArray(
    events,
    "events"
  );

  if (events.length === 0) {
    invalid(
      "events",
      "empty"
    );
  }

  const {
    unique,
    replayed,
    clocks
  } =
    sortedUniqueEvents(events, eventClock);

  if (unique.length === 0) {
    invalid(
      "events",
      "no_unique_events"
    );
  }

  const tranId =
    unique[0].tran_id;

  const tranNo =
    unique[0].tran_no ?? null;

  for (
    let index = 0;
    index < unique.length;
    index++
  ) {
    const event =
      unique[index];

    if (
      event.tran_id !== tranId
    ) {
      invalid(
        `events[${index}].tran_id`,
        "transaction_mismatch"
      );
    }

    if (
      tranNo !== null &&
      event.tran_no !== null &&
      event.tran_no !== undefined &&
      event.tran_no !== tranNo
    ) {
      invalid(
        `events[${index}].tran_no`,
        "transaction_number_mismatch"
      );
    }
  }

  const ledger =
    new Map();

  for (
    let eventIndex = 0;
    eventIndex < unique.length;
    eventIndex++
  ) {
    const event =
      unique[eventIndex];

    for (
      let lineIndex = 0;
      lineIndex < event.lines.length;
      lineIndex++
    ) {
      applyLine(
        ledger,
        event.lines[lineIndex],
        `events[${eventIndex}].lines[${lineIndex}]`
      );
    }
  }

  const ledgerLines = [];
  const activeLines = [];

  for (
    const entry
    of ledger.values()
  ) {
    const finalized =
      finalizeLine(
        entry,
        `ledger.${entry.canonical_line_id}`
      );

    ledgerLines.push(
      finalized.ledger
    );

    if (finalized.active) {
      activeLines.push({
        canonical_line_id:
          finalized.ledger
            .canonical_line_id,

        item_id:
          finalized.ledger.item_id,

        item_name:
          finalized.ledger.item_name,

        item_class_id:
          finalized.ledger
            .item_class_id,

        item_type_id:
          finalized.ledger
            .item_type_id,

        unit_id:
          finalized.ledger.unit_id,

        price:
          finalized.ledger.price,

        note:
          finalized.ledger.note,

        quantity:
          finalized.ledger
            .net_quantity,

        modifiers:
          finalized.ledger.modifiers
      });
    }
  }

  ledgerLines.sort(
    (a, b) =>
      a.canonical_line_id
        .localeCompare(
          b.canonical_line_id
        )
  );

  activeLines.sort(
    (a, b) =>
      a.canonical_line_id
        .localeCompare(
          b.canonical_line_id
        )
  );

  const totalQuantity =
    activeLines.reduce(
      (sum, line) =>
        sum + line.quantity,
      0
    );

  const state = {
    schema_version:
      OUTPUT_SCHEMA,

    source:
      "fabi_c04_sale_change_log",

    tran_id:
      tranId,

    tran_no:
      tranNo,

    unique_event_count:
      unique.length,

    replayed_event_count:
      replayed,

    first_event_created_at:
      eventClock
        ? Number(clocks.get(unique[0]) / 1000n)
        : unique[0].event_created_at,

    last_event_created_at:
      eventClock
        ? Number((clocks.get(unique[unique.length - 1]) + 999n) / 1000n)
        : unique[unique.length - 1].event_created_at,

    active_line_count:
      activeLines.length,

    total_quantity:
      totalQuantity,

    active_lines:
      activeLines,

    ledger_lines:
      ledgerLines,

    semantics: {
      quantity_model:
        "signed_delta",

      event_replay:
        "fingerprint_idempotent",

      line_disappearance_is_delete:
        false,

      remove_suffix_required:
        false,

      payment_authority:
        false,

      final_state_authority:
        false,

      c03_reconciliation_required:
        true
    }
  };

  if (eventClock) {
    state.event_time_basis = "utc_epoch_milliseconds_from_c04_observed_clock_v1";
  }

  const result = {
    ...state,

    state_fingerprint:
      fingerprint(state)
  };

  return deepFreeze(result);
}

module.exports = {
  INPUT_SCHEMA,
  OUTPUT_SCHEMA,
  projectFabiC04StateV1
};

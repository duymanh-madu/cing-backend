"use strict";

const crypto = require("node:crypto");

const SOURCE = "fabi_c04_sale_change_log";
const SUPPORTED_LOG_TYPE = "SALE_CHANGE";

const SUPPORTED_LOG_TYPES =
  Object.freeze([
    "SALE_CHANGE",
    "SALE_MERGE_ORDER"
  ]);

function invalid(path, reason = "") {
  const suffix = reason ? `.${reason}` : "";
  const error = new Error(`C04_INVALID:${path}${suffix}`);
  error.code = "C04_INVALID";
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
    value.trim().length === 0
  ) {
    invalid(path, "string_required");
  }
  return value.trim();
}

function optionalString(value, path) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    invalid(path, "string_invalid");
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function noteString(value, path) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    invalid(path, "string_invalid");
  }

  return value;
}

function finiteNonZeroNumber(value, path) {
  const number = Number(value);

  if (!Number.isFinite(number) || number === 0) {
    invalid(path, "nonzero_number_required");
  }

  return number;
}

function optionalFiniteNumber(value, path) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    invalid(path, "number_invalid");
  }

  return number;
}

function optionalInteger(value, path) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isInteger(number)) {
    invalid(path, "integer_invalid");
  }

  return number;
}

function canonicalDetailId(rawId) {
  return rawId.endsWith("_REMOVE")
    ? rawId.slice(0, -"_REMOVE".length)
    : rawId;
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

  for (const child of Object.values(value)) {
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

    for (const key of Object.keys(value).sort()) {
      out[key] = stableClone(value[key]);
    }

    return out;
  }

  return value;
}

function fingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableClone(value)))
    .digest("hex");
}

function normalizeModifier(modifier, path) {
  requiredObject(modifier, path);

  const rawDetailId =
    requiredString(
      modifier.id_sale_detail,
      `${path}.id_sale_detail`
    );

  const quantityDelta =
    finiteNonZeroNumber(
      modifier.quantity,
      `${path}.quantity`
    );

  return {
    raw_id_sale_detail: rawDetailId,
    canonical_line_id: canonicalDetailId(rawDetailId),

    item_id:
      requiredString(
        modifier.item_id,
        `${path}.item_id`
      ),

    item_name:
      requiredString(
        modifier.item_name,
        `${path}.item_name`
      ),

    item_class_id:
      requiredString(
        modifier.item_class_id,
        `${path}.item_class_id`
      ),

    item_type_id:
      optionalString(
        modifier.item_type_id,
        `${path}.item_type_id`
      ),

    quantity_delta: quantityDelta,

    direction:
      quantityDelta > 0
        ? "positive"
        : "negative",

    note:
      noteString(
        modifier.note,
        `${path}.note`
      ),

    check_active:
      optionalInteger(
        modifier.check_active,
        `${path}.check_active`
      ),

    raw_quantity:
      optionalFiniteNumber(
        modifier.raw_quantity,
        `${path}.raw_quantity`
      ),

    unit_id:
      optionalString(
        modifier.unit_id,
        `${path}.unit_id`
      ),

    is_eat_with:
      optionalInteger(
        modifier.is_eat_with,
        `${path}.is_eat_with`
      )
  };
}

function normalizeLine(line, path) {
  requiredObject(line, path);

  const rawDetailId =
    requiredString(
      line.id_sale_detail,
      `${path}.id_sale_detail`
    );

  const quantityDelta =
    finiteNonZeroNumber(
      line.quantity,
      `${path}.quantity`
    );

  const toppings =
    requiredArray(
      line.toppings,
      `${path}.toppings`
    ).map(
      (modifier, index) =>
        normalizeModifier(
          modifier,
          `${path}.toppings[${index}]`
        )
    );

  return {
    raw_id_sale_detail: rawDetailId,
    canonical_line_id: canonicalDetailId(rawDetailId),

    remove_suffix_present:
      rawDetailId.endsWith("_REMOVE"),

    item_id:
      requiredString(
        line.item_id,
        `${path}.item_id`
      ),

    item_name:
      requiredString(
        line.item_name,
        `${path}.item_name`
      ),

    item_class_id:
      requiredString(
        line.item_class_id,
        `${path}.item_class_id`
      ),

    item_type_id:
      requiredString(
        line.item_type_id,
        `${path}.item_type_id`
      ),

    item_class_name:
      optionalString(
        line.item_class_name,
        `${path}.item_class_name`
      ),

    item_type_name:
      optionalString(
        line.item_type_name,
        `${path}.item_type_name`
      ),

    quantity_delta: quantityDelta,

    direction:
      quantityDelta > 0
        ? "positive"
        : "negative",

    note:
      noteString(
        line.note,
        `${path}.note`
      ),

    status:
      optionalString(
        line.status,
        `${path}.status`
      ),

    sort_index:
      optionalFiniteNumber(
        line.sort_index,
        `${path}.sort_index`
      ),

    request_kds_before_del:
      optionalInteger(
        line.request_kds_before_del,
        `${path}.request_kds_before_del`
      ),

    unit_id:
      optionalString(
        line.unit_id,
        `${path}.unit_id`
      ),

    price:
      optionalFiniteNumber(
        line.price,
        `${path}.price`
      ),

    toppings
  };
}

function normalizeFabiC04EventV1(record) {
  requiredObject(record, "record");

  const logType =
    requiredString(
      record.log_type,
      "record.log_type"
    );

  if (
    !SUPPORTED_LOG_TYPES.includes(
      logType
    )
  ) {
    invalid(
      "record.log_type",
      "unsupported"
    );
  }

  const changeData =
    requiredObject(
      record.change_data,
      "record.change_data"
    );

  const tranId =
    requiredString(
      record.tran_id || changeData.tran_id,
      "record.tran_id"
    );

  if (
    changeData.tran_id !== undefined &&
    changeData.tran_id !== null &&
    changeData.tran_id !== "" &&
    requiredString(
      changeData.tran_id,
      "record.change_data.tran_id"
    ) !== tranId
  ) {
    invalid(
      "record.change_data.tran_id",
      "mismatch"
    );
  }

  const createdAt =
    optionalFiniteNumber(
      record.created_at,
      "record.created_at"
    );

  if (createdAt === null) {
    invalid(
      "record.created_at",
      "number_required"
    );
  }

  const updatedAt =
    optionalFiniteNumber(
      record.updated_at,
      "record.updated_at"
    );

  const lines =
    requiredArray(
      changeData.sale_detail,
      "record.change_data.sale_detail"
    ).map(
      (line, index) =>
        normalizeLine(
          line,
          `record.change_data.sale_detail[${index}]`
        )
    );

  if (lines.length === 0) {
    invalid(
      "record.change_data.sale_detail",
      "empty"
    );
  }

  const normalized = {
    schema_version:
      "cing_kds_fabi_c04_event_v1",

    source: SOURCE,

    source_log_type:
      logType,

    tran_id: tranId,

    tran_no:
      optionalString(
        changeData.tran_no,
        "record.change_data.tran_no"
      ),

    source_store_uid:
      requiredString(
        changeData.store_uid,
        "record.change_data.store_uid"
      ),

    source_brand_uid:
      requiredString(
        changeData.brand_uid,
        "record.change_data.brand_uid"
      ),

    source_company_uid:
      requiredString(
        changeData.company_uid,
        "record.change_data.company_uid"
      ),

    event_created_at:
      createdAt,

    event_updated_at:
      updatedAt,

    event_time_iso:
      optionalString(
        record.fmt_created_at,
        "record.fmt_created_at"
      ),

    lines,

    semantics: {
      quantity_model:
        "signed_delta",

      positive_quantity:
        "add_or_increase",

      negative_quantity:
        "reversal_or_decrease",

      remove_suffix:
        "supporting_signal_only",

      disappearance_is_delete:
        false,

      full_snapshot:
        false,

      payment_authority:
        false,

      final_state_authority:
        false
    }
  };

  const eventFingerprint =
    fingerprint(normalized);

  const result = {
    ...normalized,
    event_fingerprint:
      eventFingerprint
  };

  return deepFreeze(result);
}

module.exports = {
  SOURCE,
  SUPPORTED_LOG_TYPE,
  SUPPORTED_LOG_TYPES,
  canonicalDetailId,
  normalizeFabiC04EventV1
};

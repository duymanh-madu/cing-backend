"use strict";

// Classification does not establish payment, completeness or release authority.
function classifyC04LogTypeV1(type) {
  if (type === "SALE_CHANGE" || type === "SALE_MERGE_ORDER") return "signed_delta_candidate";
  if (type === "PRINT_PROVISIONAL_INVOICE" || type === "RE_PRINT_BILL") return "print_observation";
  return "review_required";
}

function summarizeC04LogTypesV1(rows) {
  if (!Array.isArray(rows)) throw new Error("KDS_LOG_ROWS_REQUIRED");
  const counts = { signed_delta_candidate: 0, print_observation: 0, review_required: 0 };
  for (const row of rows) counts[classifyC04LogTypeV1(row?.log_type)]++;
  return Object.freeze({ ...counts, payment_verified: false, completeness_verified: false });
}

module.exports = { classifyC04LogTypeV1, summarizeC04LogTypesV1 };

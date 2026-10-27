"use strict";
// Only the observed empty PIN audit envelope is non-preparation evidence.
// Never normalize this as a signed delta or use it as payment authority.
function isEmptyPinObservationV1(raw, scope) {
  if (raw?.log_type !== "LOG_USE_PIN") return false;
  const fail = () => { throw Object.assign(new Error("KDS_PAID_PIN_REVIEW_REQUIRED"), {code:"KDS_PAID_PIN_REVIEW_REQUIRED"}); };
  const object = x => x !== null && typeof x === "object" && !Array.isArray(x);
  const change = raw.change_data, current = raw.sale_current;
  if (!object(change) || !object(current) || Object.keys(current).length !== 0) fail();
  if (typeof raw.tran_id !== "string" || !raw.tran_id.trim() || raw.tran_id !== raw.tran_id.trim() || change.tran_id !== raw.tran_id) fail();
  for (const key of ["company_uid", "brand_uid", "store_uid"])
    if (typeof scope?.[key] !== "string" || !scope[key] || change[key] !== scope[key]) fail();
  if (!Array.isArray(change.sale_detail) || change.sale_detail.length !== 0 ||
      !Array.isArray(change.sale_payment_method) || change.sale_payment_method.length !== 0 ||
      change.amount_origin !== 0 || change.total_amount !== 0 ||
      change.tran_no !== "" || change.origin_tran_id !== "") fail();
  if (!Number.isSafeInteger(raw.created_at) || raw.created_at < 946684800 ||
      !Number.isSafeInteger(raw.updated_at) || raw.updated_at < raw.created_at) fail();
  if (typeof change.extra_data?.message_modify_table !== "string" ||
      !change.extra_data.message_modify_table.startsWith("Using PIN code: ") ||
      !change.extra_data.message_modify_table.slice(16).trim()) fail();
  return true;
}
module.exports = {isEmptyPinObservationV1};

"use strict";
const { branchIdentity } = require("./cingKdsBranchAccessPolicyV1");
const { buildOperationsReadModel } = require("./cingKdsOperationsReadModelV1");
const { buildPerformanceReport } = require("./cingKdsPerformanceReportV1");

const HTTP = { KDS_OPS_UNAUTHORIZED:401, KDS_OPS_FORBIDDEN:403,
  KDS_OPS_INVALID_INPUT:400, KDS_OPS_VERSION_CONFLICT:409,
  KDS_OPS_IDEMPOTENCY_CONFLICT:409, KDS_OPS_TRANSITION_CONFLICT:409,
  KDS_OPS_READ_DISABLED:423, KDS_OPS_WRITES_DISABLED:423,
  KDS_OPS_POLICY_REQUIRED:423, KDS_OPS_SOURCE_STALE:503, KDS_OPS_SNAPSHOT_LIMIT:503 };
function error(code) { return Object.assign(new Error(code), { code }); }
function createKdsOperationsBridgeV1({ rpc, verifyToken, onChange = () => {}, clock = () => new Date().toISOString() }) {
  if (typeof rpc !== "function" || typeof verifyToken !== "function") throw error("KDS_OPS_DEPENDENCY_REQUIRED");
  async function execute(req, operation) {
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers?.authorization || "");
    if (!match) throw error("KDS_OPS_UNAUTHORIZED");
    let claims;
    try { claims = await verifyToken(match[1]); } catch { throw error("KDS_OPS_UNAUTHORIZED"); }
    if (!claims || !["string", "number"].includes(typeof claims.id) || !String(claims.id).trim()) throw error("KDS_OPS_UNAUTHORIZED");
    const branch = ["branches","access_branches"].includes(operation) ? null : branchIdentity(req.query);
    const body = req.body || {};
    let payload = {};
    let durationMin = null, durationMax = null;
    if (operation === "snapshot") {
      payload = { history_from:req.query?.history_from ?? null, history_to:req.query?.history_to ?? null };
      for (const value of Object.values(payload)) if (value !== null &&
        (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
         !Number.isFinite(Date.parse(value)))) throw error("KDS_OPS_INVALID_INPUT");
      const duration = value => {
        if (value == null || value === "") return null;
        if (!/^\d+(?:\.\d+)?$/.test(String(value)) || !Number.isFinite(Number(value))) throw error("KDS_OPS_INVALID_INPUT");
        return Number(value);
      };
      durationMin = duration(req.query?.duration_min); durationMax = duration(req.query?.duration_max);
      if (durationMin !== null && durationMax !== null && durationMin > durationMax) throw error("KDS_OPS_INVALID_INPUT");
    } else if (operation === "transition") {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.cup_id || "") ||
          !Number.isSafeInteger(body.expected_version) || body.expected_version < 0 ||
          !["prepared", "served"].includes(body.target_status) ||
          typeof body.action_key !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(body.action_key)) throw error("KDS_OPS_INVALID_INPUT");
      payload = { cup_id:body.cup_id, expected_version:body.expected_version,
        target_status:body.target_status, action_key:body.action_key };
    } else if (operation === "policy") {
      if (!Number.isSafeInteger(body.warning_minutes) || !Number.isSafeInteger(body.critical_minutes) ||
          body.warning_minutes < 1 || body.critical_minutes <= body.warning_minutes || body.critical_minutes > 1440) throw error("KDS_OPS_INVALID_INPUT");
      payload = { warning_minutes:body.warning_minutes, critical_minutes:body.critical_minutes };
    }
    if(operation==="access_save") {
      if(typeof body.admin_id!=="string" || !/^[0-9]+$/.test(body.admin_id) ||
        typeof body.action_key!=="string" || !/^[A-Za-z0-9_-]{16,100}$/.test(body.action_key))throw error("KDS_OPS_INVALID_INPUT");
      payload={admin_id:body.admin_id,grant:body.grant,expected_grant:body.expected_grant,action_key:body.action_key};
    }
    let response;
    try { response = operation.startsWith("access_") ? await rpc("cing_kds_access_p13_v1",{
      p_actor_id:String(claims.id),p_operation:operation==="access_list"?"list":operation==="access_branches"?"branches":"save",p_branch:branch,p_payload:payload
    }) : await rpc("cing_kds_operations_p10_v1", {
      p_admin_id:String(claims.id), p_operation:operation, p_branch:branch, p_payload:payload
    }); } catch { throw error("KDS_OPS_UNAVAILABLE"); }
    if (response?.error) {
      const code = response.error.message;
      throw error(Object.hasOwn(HTTP, code) ? code : "KDS_OPS_UNAVAILABLE");
    }
    const data = response?.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) throw error("KDS_OPS_UNAVAILABLE");
    if (operation !== "snapshot") {
      if (operation === "transition" || operation === "policy" || operation === "access_save") {try {onChange();} catch {}}
      return { success:true, data };
    }
    if (!data.branch || data.branch.pos_parent !== branch.pos_parent || String(data.branch.pos_id) !== branch.pos_id ||
        !Array.isArray(data.orders) || !data.policy || !data.capabilities) throw error("KDS_OPS_UNAVAILABLE");
    for (const order of data.orders) if (order.pos_parent !== branch.pos_parent || String(order.pos_id) !== branch.pos_id)
      throw error("KDS_OPS_UNAVAILABLE");
    const now = clock();
    const read = buildOperationsReadModel({ orders:data.orders, now,
      warningMinutes:data.policy.warning_minutes, criticalMinutes:data.policy.critical_minutes });
    const report = buildPerformanceReport({ orders:data.orders, policies:[{...data.policy,...branch}], now, durationMin, durationMax });
    const details = new Map();
    for (const order of data.orders) for (const cup of order.cups) details.set(cup.id, {cup,order});
    function decorate(row) {
      const source = details.get(row.cup_id);
      return {...row, version:source.cup.version, prepared_at:source.cup.prepared_at,
        table_name:source.order.table_name || "", card_number:source.order.card_number || ""};
    }
    return { success:true, branch, sampled_at:data.sampled_at, policy:data.policy,
      capabilities:{transitions_enabled:data.capabilities.transitions_enabled === true,
        can_prepare:data.capabilities.can_prepare !== false,can_serve:data.capabilities.can_serve !== false},
      preparation:read.preparation_queue.map(decorate), serving:read.serving_queue.map(decorate),
      bills:data.orders.filter(order=>order.cups.some(c=>c.status!=="served")).map(order=>({
        order_id:order.id,tran_no:order.tran_no || "",table_name:order.table_name || "",card_number:order.card_number || "",
        cups:order.cups.map(cup=>({cup_id:cup.id,status:cup.status,item_name:cup.item_name,item_group:cup.item_group,version:cup.version}))
      })),
      group_counts:read.group_counts, history:report.completed_history.map(row=>({...row,tran_no:data.orders.find(o=>o.id===row.order_id)?.tran_no || ""})),
      alerts:report.active_alert_candidates, performance:report.branches,
      history_range:data.history_range,duration_filter:{minimum:durationMin,maximum:durationMax}, source_health:data.source_health || null, source_status:"canonical_database_snapshot" };
  }
  function handler(operation) {
    return async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      try { return res.status(200).json(await execute(req, operation)); }
      catch (e) {
        let code = e?.code;
        if (String(e?.message || "").startsWith("KDS_INVALID_POS") || e?.message === "KDS_BRANCH_REQUIRED") code = "KDS_OPS_INVALID_INPUT";
        if (!Object.hasOwn(HTTP, code)) code = "KDS_OPS_UNAVAILABLE";
        return res.status(HTTP[code] || 503).json({success:false,code});
      }
    };
  }
  return Object.freeze({ readSnapshot:req=>execute(req,"snapshot"), branches:handler("branches"), snapshot:handler("snapshot"),
    transition:handler("transition"), policy:handler("policy"),accessBranches:handler("access_branches"),accessList:handler("access_list"),accessSave:handler("access_save") });
}
module.exports = { createKdsOperationsBridgeV1 };

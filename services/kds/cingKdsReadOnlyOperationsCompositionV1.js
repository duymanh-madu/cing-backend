"use strict";

const {
  branchIdentity
} = require("./cingKdsBranchAccessPolicyV1");

function compositionError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requiredFunction(value, code) {
  if (typeof value !== "function") {
    throw compositionError(code);
  }
  return value;
}

function createKdsReadOnlyOperationsRouterV1({
  authenticate,
  loadGrants,
  loadOrders,
  loadPolicy,
  loadReleaseGate,
  clock,
  createRouter
} = {}) {
  const loadGate = requiredFunction(loadReleaseGate, "KDS_RELEASE_GATE_LOADER_REQUIRED");
  const loadRows = requiredFunction(loadOrders, "KDS_RELEASE_ORDERS_LOADER_REQUIRED");
  const routerFactory = requiredFunction(
    createRouter || require("../../routes/kdsOperationsRoutesV1").createKdsOperationsRouter,
    "KDS_RELEASE_ROUTER_FACTORY_REQUIRED"
  );

  const router = routerFactory({
    authenticate: requiredFunction(authenticate, "KDS_RELEASE_AUTH_REQUIRED"),
    loadGrants: requiredFunction(loadGrants, "KDS_RELEASE_GRANTS_REQUIRED"),
    loadPolicy: requiredFunction(loadPolicy, "KDS_RELEASE_POLICY_LOADER_REQUIRED"),
    clock: requiredFunction(clock, "KDS_RELEASE_CLOCK_REQUIRED"),
    loadOrders: async access => {
      const branch = branchIdentity(access);
      const gate = await loadGate(branch);
      if (
        !gate || gate.read_enabled !== true ||
        !gate.branch ||
        branchIdentity(gate.branch).pos_parent !== branch.pos_parent ||
        branchIdentity(gate.branch).pos_id !== branch.pos_id
      ) {
        throw compositionError("KDS_RELEASE_READ_NOT_ENABLED");
      }
      return loadRows(access);
    }
  });

  return Object.freeze({ router });
}

module.exports = {
  createKdsReadOnlyOperationsRouterV1
};

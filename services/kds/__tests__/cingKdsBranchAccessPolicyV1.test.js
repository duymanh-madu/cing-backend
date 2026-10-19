"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  branchIdentity,
  resolveBranchAccess,
  filterAuthorizedOrders
} = require("../cingKdsBranchAccessPolicyV1");

const principal = {
  authenticated: true,
  admin_id: "admin-1"
};

const grants = [{
  permission: "kds.orders.read",
  enabled: true,
  pos_parent: "CING",
  pos_id: 101
}];

function authorize(
  requestedBranch = {
    pos_parent: "CING",
    pos_id: 101
  },
  overrides = {}
) {
  return resolveBranchAccess({
    verifiedPrincipal: principal,
    verifiedGrants: grants,
    requestedBranch,
    ...overrides
  });
}

test("Exact authorized branch is accepted", () => {
  const result = authorize();

  assert.equal(result.pos_parent, "CING");
  assert.equal(result.pos_id, "101");
});

test("Missing authentication is denied", () => {
  assert.throws(
    () => authorize(undefined, {
      verifiedPrincipal: null
    }),
    /KDS_AUTHENTICATION_REQUIRED/
  );
});

test("Missing verified grants is denied", () => {
  assert.throws(
    () => authorize(undefined, {
      verifiedGrants: null
    }),
    /KDS_VERIFIED_GRANTS_REQUIRED/
  );
});

test("Unknown branch is denied", () => {
  assert.throws(
    () => authorize({
      pos_parent: "CING",
      pos_id: 102
    }),
    /KDS_BRANCH_ACCESS_DENIED/
  );
});

test("Same POS ID from different parent is denied", () => {
  assert.throws(
    () => authorize({
      pos_parent: "OTHER",
      pos_id: 101
    }),
    /KDS_BRANCH_ACCESS_DENIED/
  );
});

test("Permission must match exactly", () => {
  assert.throws(
    () => authorize(undefined, {
      verifiedGrants: [{
        ...grants[0],
        permission: "kds.reports.read"
      }]
    }),
    /KDS_BRANCH_ACCESS_DENIED/
  );
});

test("Disabled grants are rejected", () => {
  assert.throws(
    () => authorize(undefined, {
      verifiedGrants: [{
        ...grants[0],
        enabled: false
      }]
    }),
    /KDS_BRANCH_ACCESS_DENIED/
  );
});

test("Admin role never implies global access", () => {
  assert.throws(
    () => authorize({
      pos_parent: "OTHER",
      pos_id: 101
    }, {
      verifiedPrincipal: {
        authenticated: true,
        admin_id: "admin-1",
        role: "super_admin"
      }
    }),
    /KDS_BRANCH_ACCESS_DENIED/
  );
});

test("Wildcard branch cannot be granted", () => {
  assert.throws(
    () => authorize({
      pos_parent: "CING",
      pos_id: 102
    }, {
      verifiedGrants: [{
        permission: "kds.orders.read",
        enabled: true,
        pos_parent: "CING",
        pos_id: "*"
      }]
    }),
    /KDS_INVALID_POS_ID/
  );
});

test("Invalid POS identity is rejected", () => {
  assert.throws(
    () => branchIdentity({
      pos_parent: "CING",
      pos_id: -1
    }),
    /KDS_INVALID_POS_ID/
  );
});

test("Filter isolates exact branch tuple", () => {
  const access = authorize();

  const result = filterAuthorizedOrders({
    access,
    orders: [
      { id: "A", pos_parent: "CING", pos_id: 101 },
      { id: "B", pos_parent: "OTHER", pos_id: 101 },
      { id: "C", pos_parent: "CING", pos_id: 102 }
    ]
  });

  assert.deepEqual(
    result.map(order => order.id),
    ["A"]
  );
});

test("No access context means no data", () => {
  assert.throws(
    () => filterAuthorizedOrders({
      access: null,
      orders: []
    }),
    /KDS_ACCESS_REQUIRED/
  );
});

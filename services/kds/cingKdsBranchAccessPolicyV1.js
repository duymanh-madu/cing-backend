"use strict";

/*
 * Pure KDS authorization policy.
 *
 * SECURITY CONTRACT:
 * - verifiedPrincipal must come from trusted server auth.
 * - verifiedGrants must come from trusted database authority.
 * - NEVER pass headers, query params or JWT claims directly
 *   as verifiedGrants.
 * - This module performs no identity verification itself.
 * - No automatic all-branch access for any role.
 */

function branchIdentity(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error("KDS_BRANCH_REQUIRED");
  }

  const parent = value.pos_parent;
  const posId = value.pos_id;

  if (
    typeof parent !== "string" ||
    !parent.trim() ||
    parent !== parent.trim() ||
    parent.length > 200
  ) {
    throw new Error("KDS_INVALID_POS_PARENT");
  }

  let id;

  if (
    typeof posId === "number" &&
    Number.isSafeInteger(posId) &&
    posId > 0
  ) {
    id = String(posId);
  } else if (
    typeof posId === "string" &&
    /^[1-9]\d*$/.test(posId) &&
    Number.isSafeInteger(Number(posId))
  ) {
    id = posId;
  } else {
    throw new Error("KDS_INVALID_POS_ID");
  }

  return Object.freeze({
    pos_parent: parent,
    pos_id: id
  });
}

function key(branch) {
  const b = branchIdentity(branch);
  return JSON.stringify([b.pos_parent, b.pos_id]);
}

function resolveBranchAccess({
  verifiedPrincipal,
  verifiedGrants,
  requestedBranch
}) {
  if (
    !verifiedPrincipal ||
    typeof verifiedPrincipal !== "object" ||
    Array.isArray(verifiedPrincipal) ||
    verifiedPrincipal.authenticated !== true ||
    typeof verifiedPrincipal.admin_id !== "string" ||
    !verifiedPrincipal.admin_id.trim()
  ) {
    throw new Error("KDS_AUTHENTICATION_REQUIRED");
  }

  if (!Array.isArray(verifiedGrants)) {
    throw new Error("KDS_VERIFIED_GRANTS_REQUIRED");
  }

  const requested = branchIdentity(requestedBranch);

  const requestedKey = key(requested);

  let allowed = false;

  for (const grant of verifiedGrants) {
    if (
      !grant ||
      typeof grant !== "object" ||
      Array.isArray(grant) ||
      grant.permission !== "kds.orders.read" ||
      grant.enabled !== true
    ) {
      continue;
    }

    // Exact branch grants only.
    // No wildcard or implicit super-admin bypass.
    const granted = branchIdentity(grant);

    if (key(granted) === requestedKey) {
      allowed = true;
    }
  }

  if (!allowed) {
    throw new Error("KDS_BRANCH_ACCESS_DENIED");
  }

  return Object.freeze({
    admin_id: verifiedPrincipal.admin_id,
    pos_parent: requested.pos_parent,
    pos_id: requested.pos_id,
    permission: "kds.orders.read"
  });
}

function filterAuthorizedOrders({
  orders,
  access
}) {
  if (!Array.isArray(orders)) {
    throw new Error("KDS_ORDERS_REQUIRED");
  }

  if (
    !access ||
    access.permission !== "kds.orders.read" ||
    typeof access.admin_id !== "string" ||
    !access.admin_id.trim()
  ) {
    throw new Error("KDS_ACCESS_REQUIRED");
  }

  const authorized = branchIdentity(access);
  const allowedKey = key(authorized);

  return orders.filter(order => {
    try {
      return key(order) === allowedKey;
    } catch {
      // Malformed records are never exposed.
      return false;
    }
  });
}

module.exports = {
  branchIdentity,
  resolveBranchAccess,
  filterAuthorizedOrders
};

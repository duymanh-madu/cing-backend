"use strict";

const express = require("express");

const {
  resolveBranchAccess,
  filterAuthorizedOrders,
  branchIdentity
} = require("../services/kds/cingKdsBranchAccessPolicyV1");

const {
  buildOperationsReadModel
} = require("../services/kds/cingKdsOperationsReadModelV1");

const {
  buildPerformanceReport
} = require("../services/kds/cingKdsPerformanceReportV1");

/*
 * DORMANT DEPENDENCY-INJECTED API
 *
 * authenticate:
 *   MUST validate a real admin-panel session/token,
 *   recheck active account in the database and return
 *   {authenticated: true, admin_id: "..."}.
 *
 * loadGrants:
 *   MUST query trusted, active DB permission grants.
 *
 * loadOrders:
 *   MUST query only the authorized branch at DB level.
 *
 * loadPolicy:
 *   MUST query the authorized branch SLA policy.
 *
 * None of these functions may trust client-declared
 * roles, grant lists or payment verification flags.
 */

const ROUTES = Object.freeze({
  orders: "/orders",
  serving: "/serving",
  history: "/history",
  performance: "/performance",
  alerts: "/sla-alerts"
});

function createKdsOperationsHandlers(deps) {
  for (const name of [
    "authenticate",
    "loadGrants",
    "loadOrders",
    "loadPolicy",
    "clock"
  ]) {
    if (typeof deps?.[name] !== "function") {
      throw new Error(`KDS_ADAPTER_REQUIRED_${name}`);
    }
  }

  async function buildContext(req, needReports) {
    const principal = await deps.authenticate(req);

    if (
      !principal ||
      principal.authenticated !== true ||
      typeof principal.admin_id !== "string" ||
      !principal.admin_id.trim()
    ) {
      return { status: 401 };
    }

    const grants = await deps.loadGrants(principal);

    const requestedBranch = {
      pos_parent: req.query?.pos_parent,
      pos_id: req.query?.pos_id
    };

    // The only accepted authorization decision
    // comes from the trusted principal and DB grants.
    const access = resolveBranchAccess({
      verifiedPrincipal: principal,
      verifiedGrants: grants,
      requestedBranch
    });

    if (needReports) {
      const requested = branchIdentity(access);

      const reportAllowed = grants.some(g => {
        if (
          g?.permission !== "kds.reports.read" ||
          g.enabled !== true
        ) {
          return false;
        }

        try {
          const branch = branchIdentity(g);

          return (
            branch.pos_parent === requested.pos_parent &&
            branch.pos_id === requested.pos_id
          );
        } catch {
          return false;
        }
      });

      if (!reportAllowed) {
        return { status: 403 };
      }
    }

    const rows = await deps.loadOrders(access);

    if (!Array.isArray(rows)) {
      throw new Error("KDS_INVALID_REPOSITORY_RESPONSE");
    }

    // Defense in depth: DB query AND output filtering.
    const orders = filterAuthorizedOrders({
      orders: rows,
      access
    });

    return { access, orders };
  }

  function handler(kind) {
    const needReports = [
      "history",
      "performance",
      "alerts"
    ].includes(kind);

    return async (req, res) => {
      try {
        const context = await buildContext(
          req,
          needReports
        );

        if (context.status) {
          return res.status(context.status).json({
            success: false,
            message: context.status === 401
              ? "Unauthorized"
              : "Forbidden"
          });
        }

        const { access, orders } = context;
        const now = deps.clock();

        // Trusted server-side policy, never from URL.
        const policy = await deps.loadPolicy(access);

        if (
          !policy ||
          policy.pos_parent !== access.pos_parent ||
          String(policy.pos_id) !== access.pos_id
        ) {
          throw new Error("KDS_SLA_POLICY_SCOPE_INVALID");
        }

        let data;

        if (needReports) {
          const report = buildPerformanceReport({
            orders,
            policies: [policy],
            now
          });

          if (kind === "history") {
            data = report.completed_history;
          } else if (kind === "performance") {
            data = report.branches;
          } else {
            data = report.active_alert_candidates;
          }
        } else {
          const readModel = buildOperationsReadModel({
            orders,
            now,
            warningMinutes: policy.warning_minutes,
            criticalMinutes: policy.critical_minutes
          });

          data = kind === "orders"
            ? readModel.preparation_queue
            : readModel.serving_queue;
        }

        res.setHeader("Cache-Control", "no-store");

        return res.status(200).json({
          success: true,
          branch: {
            pos_parent: access.pos_parent,
            pos_id: access.pos_id
          },
          data
        });

      } catch (error) {
        const code = String(error?.message || "");

        if (
          code.startsWith("KDS_BRANCH_") ||
          code === "KDS_VERIFIED_GRANTS_REQUIRED" ||
          code === "KDS_ACCESS_REQUIRED"
        ) {
          return res.status(403).json({
            success: false,
            message: "Forbidden"
          });
        }

        // No internal DB errors or private data
        // are returned to the browser.
        return res.status(503).json({
          success: false,
          message: "KDS unavailable"
        });
      }
    };
  }

  return Object.freeze({
    orders: handler("orders"),
    serving: handler("serving"),
    history: handler("history"),
    performance: handler("performance"),
    alerts: handler("alerts")
  });
}

function createKdsOperationsRouter(deps) {
  const handlers = createKdsOperationsHandlers(deps);
  const router = express.Router();

  router.get(ROUTES.orders, handlers.orders);
  router.get(ROUTES.serving, handlers.serving);
  router.get(ROUTES.history, handlers.history);
  router.get(ROUTES.performance, handlers.performance);
  router.get(ROUTES.alerts, handlers.alerts);

  return router;
}

module.exports = {
  ROUTES,
  createKdsOperationsHandlers,
  createKdsOperationsRouter
};

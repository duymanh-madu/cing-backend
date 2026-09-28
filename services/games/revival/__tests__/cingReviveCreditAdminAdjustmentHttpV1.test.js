"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const root =
  path.resolve(
    __dirname,
    "../../../.."
  );

function read(file) {
  return fs.readFileSync(
    path.join(root, file),
    "utf8"
  );
}

const route = read(
  "routes/adminReviveCreditRoutes.js"
);

const service = read(
  "services/games/revival/cingReviveCreditAdminAdjustmentService.js"
);

const mount = read(
  "routes/adminRoutes.js"
);

test(
  "Revive Admin route mounts once",
  () => {
    const matches =
      mount.match(
        /router\.use\("\/revive-credits",\s*require\("\.\/adminReviveCreditRoutes"\)\)/g
      ) || [];

    assert.equal(
      matches.length,
      1
    );
  }
);

test(
  "route requires Admin Panel permission",
  () => {
    assert.match(
      route,
      /requirePanelPermission\(\s*"revive\.credit\.adjust"\s*\)/
    );
  }
);

test(
  "route explicitly requires super_admin",
  () => {
    assert.match(
      route,
      /req\.admin\?\.role\s*!==\s*"super_admin"/
    );
  }
);

test(
  "actor comes from verified admin, not body",
  () => {
    assert.match(
      route,
      /req\.admin\?\.id/
    );

    assert.match(
      route,
      /actor_admin_id:\s*actorId/
    );

    assert.doesNotMatch(
      route,
      /body\.actor_id|body\.actor_admin_id/
    );
  }
);

test(
  "request rejects unknown fields",
  () => {
    assert.match(
      route,
      /ALLOWED_FIELDS\.has\(key\)/
    );

    assert.doesNotMatch(
      route,
      /"actor_id",/
    );
  }
);

test(
  "amount and UUID validated",
  () => {
    assert.match(
      route,
      /Number\.isInteger\(amount\)/
    );

    assert.match(
      route,
      /amount === 0/
    );

    assert.match(
      route,
      /REQUEST_UUID\.test/
    );
  }
);

test(
  "reason, note and external reference validated",
  () => {
    assert.match(
      route,
      /REASON_CODE\.test/
    );

    assert.match(
      route,
      /REVIVE_ADMIN_NOTE_INVALID/
    );

    assert.match(
      route,
      /REVIVE_ADMIN_REFERENCE_INVALID/
    );
  }
);

test(
  "service calls exact PostgreSQL authority",
  () => {
    assert.match(
      service,
      /cing_revive_credit_admin_adjust_v1/
    );

    for (const key of [
      "p_user_id",
      "p_amount",
      "p_request_id",
      "p_reason_code",
      "p_note",
      "p_reference_type",
      "p_reference_id",
      "p_actor_admin_id",
    ]) {
      assert.match(
        service,
        new RegExp(key)
      );
    }
  }
);

test(
  "no direct balance or financial mutation",
  () => {
    const combined =
      route + "\n" + service;

    assert.doesNotMatch(
      combined,
      /\.from\(\s*["'](?:players|cing_revive_credit_balances|cing_wallets|wallets|point_transactions)["']\s*\)\s*\.update\(/i
    );
  }
);

test(
  "error boundary does not expose raw SQL error",
  () => {
    assert.match(
      route,
      /REVIVE_ADMIN_ADJUSTMENT_FAILED/
    );

    assert.doesNotMatch(
      route,
      /error:\s*error\.message/
    );
  }
);

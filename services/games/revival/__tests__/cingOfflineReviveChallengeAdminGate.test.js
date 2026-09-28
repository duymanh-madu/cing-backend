"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  requireChallengeSuperAdmin,
} = require(
  "../cingOfflineReviveChallengeAdminGate"
);

const routeSource =
  fs.readFileSync(
    path.resolve(
      __dirname,
      "../../../../routes/gameRoutes.js"
    ),
    "utf8"
  );

function invoke(admin) {
  let nextCalls = 0;
  let statusCode = null;
  let body = null;

  const res = {
    status(value) {
      statusCode = value;
      return this;
    },

    json(value) {
      body = value;
      return this;
    },
  };

  requireChallengeSuperAdmin(
    { admin },
    res,
    () => {
      nextCalls++;
    }
  );

  return {
    nextCalls,
    statusCode,
    body,
  };
}

test(
  "Super Admin may proceed",
  () => {
    const result = invoke({
      role: "super_admin",
    });

    assert.equal(
      result.nextCalls,
      1
    );

    assert.equal(
      result.statusCode,
      null
    );
  }
);

test(
  "unauthenticated request is denied",
  () => {
    const result = invoke(
      undefined
    );

    assert.equal(
      result.nextCalls,
      0
    );

    assert.equal(
      result.statusCode,
      403
    );
  }
);

for (const role of [
  "manager",
  "cashier",
  "kitchen",
  "shipper",
  "marketing",
  "delivery_admin",
]) {
  test(
    `${role} cannot mutate challenge`,
    () => {
      const result = invoke({
        role,
      });

      assert.equal(
        result.nextCalls,
        0
      );

      assert.equal(
        result.statusCode,
        403
      );

      assert.equal(
        result.body.code,
        "CHALLENGE_SUPER_ADMIN_REQUIRED"
      );
    }
  );
}

test(
  "reset route requires authentication and role",
  () => {
    assert.match(
      routeSource,
      /router\.delete\(\s*["']\/daily-challenge\/reset["'],\s*verifyAdmin,\s*requireChallengeSuperAdmin,\s*async\s*\(req,\s*res\)/ 
    );
  }
);

test(
  "sync route requires authentication and role",
  () => {
    assert.match(
      routeSource,
      /router\.post\(\s*["']\/daily-challenge\/sync-today["'],\s*verifyAdmin,\s*requireChallengeSuperAdmin,\s*async\s*\(req,\s*res\)/
    );
  }
);

test(
  "customer claim route remains unchanged in scope",
  () => {
    assert.match(
      routeSource,
      /router\.post\(["']\/daily-challenge\/claim["'],\s*async\s*\(req,\s*res\)/
    );
  }
);

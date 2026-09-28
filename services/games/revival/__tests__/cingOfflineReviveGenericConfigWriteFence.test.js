"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const servicePath = path.resolve(
  __dirname,
  "../../../../services/appConfigService.js"
);

const routePath = path.resolve(
  __dirname,
  "../../../../routes/appConfigRoutes.js"
);

const service = fs.readFileSync(
  servicePath,
  "utf8"
);

const routes = fs.readFileSync(
  routePath,
  "utf8"
);

test(
  "generic config writer rejects daily challenge field",
  () => {
    assert.match(
      service,
      /Object\.prototype\.hasOwnProperty\.call\(\s*payload,\s*"daily_challenge_config"\s*\)/
    );

    assert.match(
      service,
      /REVIVAL_CHALLENGE_DEDICATED_ADMIN_APPLY_REQUIRED/
    );

    assert.match(
      service,
      /error\.statusCode = 409/
    );
  }
);

test(
  "fence precedes generic Supabase update",
  () => {
    const start = service.indexOf(
      "async function updateAppConfig"
    );

    const fence = service.indexOf(
      "REVIVAL_CHALLENGE_DEDICATED_ADMIN_APPLY_REQUIRED",
      start
    );

    const update = service.indexOf(
      '.from("app_configs")',
      start
    );

    assert.ok(start >= 0);
    assert.ok(fence > start);
    assert.ok(update > fence);
  }
);

test(
  "multiplayer legal gate is retained",
  () => {
    assert.match(
      service,
      /customer_multiplayer_enabled:\s*_protectedCustomerMultiplayerEnabled/
    );

    assert.match(
      service,
      /\.\.\.mutablePayload/
    );
  }
);

test(
  "generic app config route stays JWT protected",
  () => {
    assert.match(
      routes,
      /router\.put\(\s*"\/:id",\s*verifyAdmin/
    );
  }
);

test(
  "public app config read is preserved",
  () => {
    assert.match(
      routes,
      /router\.get\(\s*"\/public"/
    );
  }
);

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../../..");

const route = fs.readFileSync(
  path.join(root, "routes/profileUpdateRoutes.js"),
  "utf8"
);

test("notification GET requires authentication", () => {
  assert.match(
    route,
    /router\.get\(\s*"\/notifications\/:userId",\s*authMiddleware,/
  );
});

test("notification mark-read requires authentication", () => {
  assert.match(
    route,
    /router\.post\(\s*"\/notifications\/mark-read",\s*authMiddleware,/
  );
});

test("notification owner comes from authenticated customer", () => {
  assert.match(
    route,
    /normalizePhone\(req\.customer\?\.phone \|\| ""\)/
  );

  assert.match(
    route,
    /requested !== phone/
  );
});

test("mark-read requires explicit bounded IDs", () => {
  assert.match(
    route,
    /!Array\.isArray\(ids\)/
  );

  assert.match(
    route,
    /ids\.length === 0/
  );

  assert.match(
    route,
    /ids\.length > 20/
  );

  assert.match(
    route,
    /\.eq\("user_id", phone\)/
  );
});

test("database read and update errors are checked", () => {
  const section = route.slice(
    route.indexOf(
      "CING_NOTIFICATION_RECOVERY_AUTH_V1"
    ),
    route.indexOf(
      "// PATCH /profile/:userId/preferences",
      route.indexOf(
        "CING_NOTIFICATION_RECOVERY_AUTH_V1"
      )
    )
  );

  assert.match(
    section,
    /if \(error\) throw error/g
  );

  assert.match(
    section,
    /NOTIFICATION_READ_FAILED/
  );

  assert.match(
    section,
    /NOTIFICATION_MARK_READ_FAILED/
  );
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../tools/runCingKdsFabiControlProofV1.js"
  ),
  "utf8"
);

test(
  "manual KDS runner uses dedicated FABi credentials only",
  () => {
    assert.match(
      source,
      /IPOS_TOKEN:\s*process\.env\.KDS_FABI_AUTHORIZATION/
    );

    assert.match(
      source,
      /IPOS_ACCESS_TOKEN:\s*process\.env\.KDS_FABI_ACCESS_TOKEN/
    );

    assert.doesNotMatch(
      source,
      /process\.env\.IPOS_TOKEN\b/
    );

    assert.doesNotMatch(
      source,
      /process\.env\.IPOS_ACCESS_TOKEN\b/
    );
  }
);

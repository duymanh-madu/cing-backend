"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const servicePath = path.resolve(
  __dirname,
  "../cingPointsBuyReviveCreditsService.js"
);

const serviceRequire =
  createRequire(servicePath);

const source =
  fs.readFileSync(
    servicePath,
    "utf8"
  );

test(
  "Points purchase resolves the actual backend Supabase module",
  () => {
    const actual =
      serviceRequire.resolve(
        "../../../supabase"
      );

    const expected =
      require.resolve(
        path.resolve(
          __dirname,
          "../../../../supabase"
        )
      );

    assert.equal(
      actual,
      expected
    );
  }
);

test(
  "Points purchase resolves canonical phone identity",
  () => {
    const actual =
      serviceRequire.resolve(
        "../../../utils/phoneIdentity"
      );

    const expected =
      require.resolve(
        path.resolve(
          __dirname,
          "../../../../utils/phoneIdentity"
        )
      );

    assert.equal(
      actual,
      expected
    );
  }
);

test(
  "service contains exact corrected imports",
  () => {
    assert.match(
      source,
      /require\("\.\.\/\.\.\/\.\.\/supabase"\)/
    );

    assert.match(
      source,
      /"\.\.\/\.\.\/\.\.\/utils\/phoneIdentity"/
    );

    assert.doesNotMatch(
      source,
      /require\("\.\.\/\.\.\/supabase"\)/
    );
  }
);

test(
  "service remains attached to dormant Points purchase RPC",
  () => {
    assert.match(
      source,
      /"cing_points_purchase_revive_credits_v1"/
    );

    assert.match(
      source,
      /customer\?\.phone/
    );

    assert.doesNotMatch(
      source,
      /\bupdateMemberPoint\s*\(/
    );

    assert.doesNotMatch(
      source,
      /\bdeductPoints\s*\(/
    );
  }
);

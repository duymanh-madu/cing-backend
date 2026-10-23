"use strict";

const fs =
  require("node:fs");
const path =
  require("node:path");
const test =
  require("node:test");
const assert =
  require("node:assert/strict");

const ROOT =
  path.resolve(
    __dirname,
    "../../.."
  );

const source =
  fs.readFileSync(
    path.join(
      ROOT,
      "routes/zaloOaRoutes.js"
    ),
    "utf8"
  );

function exchangeRegion() {
  const start =
    source.indexOf(
      'console.log(\n      "[ZALO OA] Exchanging authorization code"'
    );

  const end =
    source.indexOf(
      "const body =",
      start
    );

  assert.notEqual(
    start,
    -1,
    "exchange start marker missing"
  );

  assert.notEqual(
    end,
    -1,
    "exchange end marker missing"
  );

  return source.slice(
    start,
    end
  );
}

test(
  "authorization exchange has a dedicated HTTP failure diagnostic",
  () => {
    const region =
      exchangeRegion();

    assert.match(
      region,
      /catch\s*\(\s*exchangeError\s*\)/
    );

    assert.match(
      region,
      /Authorization exchange HTTP failure/
    );

    assert.match(
      region,
      /response\?\.status/
    );
  }
);

test(
  "diagnostic exposes only bounded Zalo error metadata",
  () => {
    const region =
      exchangeRegion();

    assert.match(
      region,
      /responseBody\.error/
    );

    assert.match(
      region,
      /responseBody\.error_name/
    );

    assert.match(
      region,
      /responseBody\.message/
    );

    assert.match(
      region,
      /error_description/
    );

    assert.match(
      region,
      /\.slice\(\s*0,\s*300\s*\)/
    );
  }
);

test(
  "diagnostic never serializes Axios request config or complete response body",
  () => {
    const region =
      exchangeRegion();

    assert.doesNotMatch(
      region,
      /exchangeError\.config/
    );

    assert.doesNotMatch(
      region,
      /JSON\.stringify\s*\(\s*responseBody/
    );

    assert.doesNotMatch(
      region,
      /console\.(?:log|error)\s*\([^)]*responseBody/s
    );
  }
);

test(
  "known credential field names are explicitly redacted",
  () => {
    const region =
      exchangeRegion();

    assert.match(
      region,
      /access_token\|refresh_token\|code_verifier\|secret_key/
    );

    assert.match(
      region,
      /\[REDACTED\]/
    );
  }
);

test(
  "exchange failure is converted to a stable internal error code",
  () => {
    const region =
      exchangeRegion();

    assert.match(
      region,
      /ZALO_OA_AUTHORIZATION_EXCHANGE_HTTP_FAILED/
    );
  }
);

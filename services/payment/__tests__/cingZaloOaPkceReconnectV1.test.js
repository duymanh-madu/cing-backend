const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync(
  "routes/zaloOaRoutes.js",
  "utf8"
);

function region(from, to) {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `missing ${from}`);

  const end = source.indexOf(to, start + from.length);
  assert.ok(end > start, `missing ${to}`);

  return source.slice(start, end);
}

test(
  "OA reconnect start is admin-only",
  () => {
    const start = region(
      '// POST /api/zalo/oa-connect/start',
      '// GET /api/zalo/oa-callback'
    );

    assert.match(
      start,
      /"\/oa-connect\/start"[\s\S]*verifyAdmin/
    );
  }
);

test(
  "PKCE verifier and challenge use secure native crypto",
  () => {
    assert.match(
      source,
      /crypto[\s\S]*randomBytes\(32\)[\s\S]*createHash\("sha256"\)/
    );

    assert.match(
      source,
      /\.digest\("base64url"\)/
    );
  }
);

test(
  "OAuth state is random and expires after ten minutes",
  () => {
    const start = region(
      '// POST /api/zalo/oa-connect/start',
      '// GET /api/zalo/oa-callback'
    );

    assert.match(
      source,
      /randomBytes\(24\)/
    );

    assert.match(
      source,
      /OA_CONNECT_TTL_SECONDS\s*=\s*[\s\S]*10\s*\*\s*60/
    );

    assert.match(
      start,
      /redis\.setex\([\s\S]*OA_CONNECT_TTL_SECONDS/
    );
  }
);

test(
  "start returns server-generated authorization URL without exposing verifier",
  () => {
    const start = region(
      '// POST /api/zalo/oa-connect/start',
      '// GET /api/zalo/oa-callback'
    );

    assert.match(
      start,
      /https:\/\/oauth\.zaloapp\.com\/v4\/oa\/permission/
    );

    assert.match(
      start,
      /authorization_url/
    );

    assert.doesNotMatch(
      start,
      /data:\s*\{[\s\S]*verifier\s*,/
    );
  }
);

test(
  "callback requires and one-time consumes OAuth state",
  () => {
    const callback = region(
      '// GET /api/zalo/oa-callback',
      '// POST /api/zalo/send-message'
    );

    assert.match(
      callback,
      /req\.query\.state/
    );

    const getPos =
      callback.indexOf("await redis.get(key)");

    const delPos =
      callback.indexOf("await redis.del(key)");

    const exchangePos =
      callback.indexOf("await axios.post(");

    assert.ok(getPos >= 0);
    assert.ok(delPos > getPos);
    assert.ok(exchangePos > delPos);
  }
);

test(
  "authorization exchange is form-urlencoded and includes PKCE verifier",
  () => {
    const callback = region(
      '// GET /api/zalo/oa-callback',
      '// POST /api/zalo/send-message'
    );

    assert.match(
      callback,
      /new URLSearchParams\([\s\S]*code_verifier/
    );

    assert.match(
      callback,
      /application\/x-www-form-urlencoded/
    );
  }
);

test(
  "complete access and refresh pair is required",
  () => {
    const callback = region(
      '// GET /api/zalo/oa-callback',
      '// POST /api/zalo/send-message'
    );

    assert.match(
      callback,
      /!accessToken[\s\S]*!refreshToken/
    );

    assert.match(
      callback,
      /complete credential pair/
    );
  }
);

test(
  "new access credential is validated before persistence",
  () => {
    const callback = region(
      '// GET /api/zalo/oa-callback',
      '// POST /api/zalo/send-message'
    );

    const validation =
      callback.indexOf(
        "https://openapi.zalo.me/v2.0/oa/getoa"
      );

    const persistence =
      callback.indexOf(
        '.from(\n          "app_configs"'
      );

    assert.ok(validation >= 0);
    assert.ok(persistence > validation);
  }
);

test(
  "refresh runtime remains database-authoritative",
  () => {
    const refresh = region(
      "// Auto-refresh token",
      "// GET /api/zalo/refresh-token"
    );

    assert.match(
      refresh,
      /\.select\("zalo_oa_refresh_token"\)/
    );

    assert.doesNotMatch(
      refresh,
      /process\.env\.ZALO_OA_REFRESH_TOKEN/
    );
  }
);

test(
  "callback stays public while reconnect start is protected",
  () => {
    assert.match(
      source,
      /router\.get\("\/oa-callback",\s*async/
    );

    assert.doesNotMatch(
      source,
      /router\.get\("\/oa-callback",\s*verifyAdmin/
    );

    assert.match(
      source,
      /"\/oa-connect\/start",\s*verifyAdmin/
    );
  }
);

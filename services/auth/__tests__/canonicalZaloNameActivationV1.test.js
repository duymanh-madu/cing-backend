const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "authService.js"
  ),
  "utf8"
);

test("Cing iu is rejected as an authentication identity name", () => {
  const genericRegion = source.slice(
    source.indexOf("const GENERIC_AUTH_NAMES"),
    source.indexOf("function cleanDisplayName")
  );

  assert.match(
    genericRegion,
    /["']cing iu["']/
  );
});

test("new CRM member requires a canonical non-generic name", () => {
  const start = source.indexOf(
    "const canonicalNewMemberName"
  );

  const defer = source.indexOf(
    'logger.warn("iPOS member creation deferred',
    start
  );

  assert.ok(start >= 0);
  assert.ok(defer > start);

  const region = source.slice(start, defer);

  assert.match(
    region,
    /pickDisplayName\s*\([\s\S]*zaloUser\.name[\s\S]*customer\.name/
  );

  assert.match(
    region,
    /if\s*\(\s*canonicalNewMemberName\s*\)/
  );

  assert.match(
    region,
    /name:\s*canonicalNewMemberName/
  );

  assert.doesNotMatch(
    region,
    /\|\|\s*["']Cing iu["']/
  );
});

test("missing canonical name defers CRM creation instead of creating placeholder member", () => {
  assert.match(
    source,
    /iPOS member creation deferred: canonical Zalo name missing/
  );
});

test("existing CRM name precedence remains preserved", () => {
  assert.match(
    source,
    /zaloUser\.name\s*=\s*pickDisplayName\s*\(\s*crmName\s*,\s*zaloName\s*\)/
  );

  assert.match(
    source,
    /pickDisplayName\s*\(\s*playerData\?\.display_name\s*,\s*crmMemberData\?\.name/
  );
});

test("backend OA profile recovery remains before customer upsert", () => {
  const oa = source.indexOf(
    "openapi.zalo.me/v2.0/oa/getprofile"
  );

  const upsert = source.indexOf(
    "customerRepository.upsertCustomer"
  );

  assert.ok(oa >= 0);
  assert.ok(upsert > oa);
});

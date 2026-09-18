const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const source =
  fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "authService.js"
    ),
    "utf8"
  );

test(
  "login response never manufactures Cing iu fallback",
  () => {
    const start =
      source.indexOf(
        "async function loginWithZalo"
      );

    const end =
      source.indexOf(
        "async function refreshSession",
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const region =
      source.slice(start, end);

    assert.doesNotMatch(
      region,
      /\|\|\s*["']Cing iu["']/
    );
  }
);

test(
  "refresh response never manufactures Cing iu fallback",
  () => {
    const start =
      source.indexOf(
        "async function refreshSession"
      );

    const end =
      source.indexOf(
        "async function evaluateAuthenticatedSessionEntry",
        start
      );

    assert.ok(start >= 0);
    assert.ok(end > start);

    const region =
      source.slice(start, end);

    assert.doesNotMatch(
      region,
      /\|\|\s*["']Cing iu["']/
    );
  }
);

test(
  "Cing iu remains rejected as generic input only",
  () => {
    const genericStart =
      source.indexOf(
        "const GENERIC_AUTH_NAMES"
      );

    const genericEnd =
      source.indexOf(
        "function cleanDisplayName",
        genericStart
      );

    const genericRegion =
      source.slice(
        genericStart,
        genericEnd
      );

    assert.match(
      genericRegion,
      /["']cing iu["']/
    );

    const remainder =
      source.slice(genericEnd);

    assert.doesNotMatch(
      remainder,
      /["']Cing iu["']/
    );
  }
);

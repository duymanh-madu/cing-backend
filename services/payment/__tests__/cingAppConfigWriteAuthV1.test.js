"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const routePath =
  path.resolve(
    __dirname,
    "../../../routes/appConfigRoutes.js"
  );

const adminAuthRoutesPath =
  path.resolve(
    __dirname,
    "../../../routes/adminAuthRoutes.js"
  );

test(
  "app config write routes use admin login Bearer JWT verifier",
  () => {
    const source =
      fs.readFileSync(
        routePath,
        "utf8"
      );

    assert.match(
      source,
      /verifyAdmin[\s\S]*require\([\s\S]*\.\/adminAuthRoutes/
    );

    assert.match(
      source,
      /router\.post\([\s\S]*"\/init"[\s\S]*verifyAdmin/
    );

    assert.match(
      source,
      /router\.put\([\s\S]*"\/:id"[\s\S]*verifyAdmin/
    );

    assert.doesNotMatch(
      source,
      /adminAuthMiddleware/
    );
  }
);

test(
  "public config read remains unauthenticated",
  () => {
    const source =
      fs.readFileSync(
        routePath,
        "utf8"
      );

    const start =
      source.indexOf(
        'router.get(\n  "/public"'
      );

    assert.ok(
      start >= 0
    );

    const end =
      source.indexOf(
        "/**",
        start + 10
      );

    const block =
      source.slice(
        start,
        end > start
          ? end
          : undefined
      );

    assert.doesNotMatch(
      block,
      /verifyAdmin/
    );
  }
);

test(
  "admin login issuer and verifier share JWT_SECRET authority",
  () => {
    const source =
      fs.readFileSync(
        adminAuthRoutesPath,
        "utf8"
      );

    assert.match(
      source,
      /jwtSecretAuthority/
    );

    assert.match(
      source,
      /jwt\.sign\([\s\S]*JWT_SECRET/
    );

    assert.match(
      source,
      /function verifyAdmin[\s\S]*jwt\.verify\([\s\S]*JWT_SECRET/
    );

    assert.match(
      source,
      /module\.exports\.verifyAdmin\s*=\s*verifyAdmin/
    );
  }
);

test(
  "app config auth never trusts caller identity headers",
  () => {
    const source =
      fs.readFileSync(
        routePath,
        "utf8"
      );

    assert.doesNotMatch(
      source,
      /x-user-id|x-zalo-user-id/i
    );
  }
);

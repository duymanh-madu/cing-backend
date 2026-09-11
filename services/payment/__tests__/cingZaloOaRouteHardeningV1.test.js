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
    "../../../routes/zaloOaRoutes.js"
  );

const adminAuthRoutesPath =
  path.resolve(
    __dirname,
    "../../../routes/adminAuthRoutes.js"
  );

test(
  "sensitive Zalo OA routes require admin Bearer JWT",
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
      /router\.post\("\/send-message",\s*verifyAdmin/
    );

    assert.match(
      source,
      /router\.get\("\/refresh-token",\s*verifyAdmin/
    );

    assert.match(
      source,
      /router\.get\("\/last-webhook",\s*verifyAdmin/
    );
  }
);

test(
  "OAuth callback and OA webhook remain public integration surfaces",
  () => {
    const source =
      fs.readFileSync(
        routePath,
        "utf8"
      );

    assert.match(
      source,
      /router\.get\("\/oa-callback",\s*async/
    );

    assert.match(
      source,
      /router\.post\("\/oa-webhook",\s*async/
    );

    assert.doesNotMatch(
      source,
      /router\.get\("\/oa-callback",\s*verifyAdmin/
    );

    assert.doesNotMatch(
      source,
      /router\.post\("\/oa-webhook",\s*verifyAdmin/
    );
  }
);

test(
  "Zalo OA route logs do not serialize token responses",
  () => {
    const source =
      fs.readFileSync(
        routePath,
        "utf8"
      );

    assert.doesNotMatch(
      source,
      /Exchange result\.data/
    );

    assert.doesNotMatch(
      source,
      /\[ZALO OA\] Response:/
    );

    assert.doesNotMatch(
      source,
      /JSON\.stringify\(result\.data\)/
    );

    assert.doesNotMatch(
      source,
      /JSON\.stringify\(err\.response\?\.data\)/
    );

    assert.doesNotMatch(
      source,
      /Zalo trả về:[\s\S]*result\.data/
    );
  }
);

test(
  "Zalo OA admin auth shares the admin login JWT authority",
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
  }
);

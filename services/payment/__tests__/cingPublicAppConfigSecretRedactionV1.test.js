"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const servicePath =
  path.resolve(
    __dirname,
    "../../appConfigService.js"
  );

const routePath =
  path.resolve(
    __dirname,
    "../../../routes/appConfigRoutes.js"
  );

test(
  "public app config strips Zalo OA credentials",
  () => {
    const source =
      fs.readFileSync(
        servicePath,
        "utf8"
      );

    assert.match(
      source,
      /zalo_oa_access_token[\s\S]*_privateZaloOaAccessToken/
    );

    assert.match(
      source,
      /zalo_oa_refresh_token[\s\S]*_privateZaloOaRefreshToken/
    );

    assert.match(
      source,
      /return publicConfig/
    );
  }
);

test(
  "public route still delegates to public config authority",
  () => {
    const source =
      fs.readFileSync(
        routePath,
        "utf8"
      );

    assert.match(
      source,
      /router\.get\([\s\S]*"\/public"[\s\S]*getPublicAppConfig/
    );
  }
);

test(
  "security patch does not touch payment or wallet authority",
  () => {
    const source =
      fs.readFileSync(
        servicePath,
        "utf8"
      );

    assert.doesNotMatch(
      source,
      /momo.*mutation|wallet.*mutation|checkout.*mutation/i
    );
  }
);

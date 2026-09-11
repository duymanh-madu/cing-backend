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

test(
  "Zalo refresh authority reads refresh token from app_configs",
  () => {
    const source =
      fs.readFileSync(
        routePath,
        "utf8"
      );

    assert.match(
      source,
      /\.select\("zalo_oa_refresh_token"\)/
    );

    assert.match(
      source,
      /config\?\.zalo_oa_refresh_token/
    );
  }
);

test(
  "Zalo refresh authority never falls back to environment refresh token",
  () => {
    const source =
      fs.readFileSync(
        routePath,
        "utf8"
      );

    assert.doesNotMatch(
      source,
      /process\.env\.ZALO_OA_REFRESH_TOKEN/
    );

    assert.doesNotMatch(
      source,
      /\|\|\s*process\.env\.ZALO_OA_REFRESH_TOKEN/
    );
  }
);

test(
  "missing database refresh token fails closed",
  () => {
    const source =
      fs.readFileSync(
        routePath,
        "utf8"
      );

    assert.match(
      source,
      /if\s*\(!refresh_token\)[\s\S]*No database Zalo OA refresh token/
    );
  }
);

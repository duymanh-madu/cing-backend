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
  "Zalo webhook logs metadata without serializing raw body",
  () => {
    const source =
      fs.readFileSync(
        routePath,
        "utf8"
      );

    assert.doesNotMatch(
      source,
      /console\.log\([\s\S]{0,120}JSON\.stringify\(body\)/
    );

    assert.match(
      source,
      /\[ZALO OA WEBHOOK\] received/
    );

    assert.match(
      source,
      /event_name/
    );

    assert.match(
      source,
      /has_sender/
    );

    assert.match(
      source,
      /has_recipient/
    );
  }
);

test(
  "webhook Redis snapshot behavior remains unchanged",
  () => {
    const source =
      fs.readFileSync(
        routePath,
        "utf8"
      );

    assert.match(
      source,
      /redis\.setex\("zalo:last_webhook",\s*3600,\s*JSON\.stringify\(body\)\)/
    );
  }
);

test(
  "webhook receiver remains public",
  () => {
    const source =
      fs.readFileSync(
        routePath,
        "utf8"
      );

    assert.match(
      source,
      /router\.post\("\/oa-webhook",\s*async/
    );

    assert.doesNotMatch(
      source,
      /router\.post\("\/oa-webhook",\s*verifyAdmin/
    );
  }
);

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("fs");

const path =
  require("path");

const controllerPath =
  path.resolve(
    __dirname,
    "../../../controllers/auth/authController.js"
  );

const helperPath =
  path.resolve(
    __dirname,
    "../authInstallationObservability.js"
  );

test(
  "exact auth surfaces emit hashed installation observability",
  () => {
    const source =
      fs.readFileSync(
        controllerPath,
        "utf8"
      );

    assert.match(
      source,
      /surface:\s*"zalo_login"/
    );

    assert.match(
      source,
      /surface:\s*"member_app_open"/
    );

    assert.match(
      source,
      /surface:\s*"session_open"/
    );

    const calls =
      source.match(
        /logAuthInstallationObservation\(\{/g
      ) || [];

    assert.equal(
      calls.length,
      3
    );
  }
);

test(
  "helper logs only fingerprint and never raw installation field",
  () => {
    const source =
      fs.readFileSync(
        helperPath,
        "utf8"
      );

    assert.match(
      source,
      /createHash\("sha256"\)/
    );

    assert.match(
      source,
      /installation_fp:/
    );

    assert.match(
      source,
      /installation_present:/
    );

    assert.doesNotMatch(
      source,
      /logger\.info[\s\S]*installation_id\s*:/
    );

    assert.doesNotMatch(
      source,
      /metadata[\s\S]*installationId\s*:/
    );
  }
);

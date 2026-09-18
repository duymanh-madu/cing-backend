const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

function read(path) {
  return fs.readFileSync(
    path,
    "utf8"
  );
}

test(
  "device register is authenticated and recover remains credential-gated",
  () => {
    const routes =
      read("routes/authRoutes.js");

    assert.match(
      routes,
      /"\/device\/register"[\s\S]{0,120}authMiddleware[\s\S]{0,120}registerDeviceReauth/
    );

    assert.match(
      routes,
      /"\/device\/recover"[\s\S]{0,120}recoverDeviceReauth/
    );
  }
);

test(
  "migration never stores plaintext device secret",
  () => {
    const sql =
      read(
        "db/migrations/20260918_cing_device_reauth_sessions_v1.sql"
      );

    assert.match(
      sql,
      /token_hash text NOT NULL/
    );

    assert.doesNotMatch(
      sql,
      /token_secret|plaintext_secret|raw_secret/
    );

    assert.match(
      sql,
      /ENABLE ROW LEVEL SECURITY/
    );

    assert.match(
      sql,
      /REVOKE ALL[\s\S]*FROM anon/
    );

    assert.match(
      sql,
      /REVOKE ALL[\s\S]*FROM authenticated/
    );

    assert.match(
      sql,
      /TO service_role/
    );
  }
);

test(
  "service uses cryptographic random, sha256 and timing safe comparison",
  () => {
    const source =
      read(
        "services/auth/deviceReauthService.js"
      );

    assert.match(
      source,
      /randomBytes/
    );

    assert.match(
      source,
      /createHash\("sha256"\)/
    );

    assert.match(
      source,
      /timingSafeEqual/
    );

    assert.doesNotMatch(
      source,
      /Math\.random/
    );
  }
);

test(
  "logout revokes device reauth before legacy logout",
  () => {
    const source =
      read(
        "controllers/auth/authController.js"
      );

    const revoke =
      source.indexOf(
        ".revokeCustomer"
      );

    const legacy =
      source.indexOf(
        "authService.logout"
      );

    assert.ok(
      revoke >= 0
    );

    assert.ok(
      legacy > revoke
    );
  }
);

test(
  "device reauth service can be imported without Supabase environment",
  () => {
    const {
      spawnSync,
    } = require("node:child_process");

    const env = {
      ...process.env,
    };

    delete env.SUPABASE_URL;
    delete env.SUPABASE_SERVICE_ROLE_KEY;

    const result =
      spawnSync(
        process.execPath,
        [
          "-e",
          'require("./services/auth/deviceReauthService"); process.stdout.write("IMPORT_OK")',
        ],
        {
          cwd: process.cwd(),
          env,
          encoding: "utf8",
        }
      );

    assert.equal(
      result.status,
      0,
      result.stderr
    );

    assert.equal(
      result.stdout,
      "IMPORT_OK"
    );
  }
);

test(
  "recover uses atomic database consume-and-rotate authority",
  () => {
    const repository =
      read(
        "repositories/auth/deviceReauthRepository.js"
      );

    const service =
      read(
        "services/auth/deviceReauthService.js"
      );

    const migration =
      read(
        "db/migrations/20260918_cing_device_reauth_sessions_v1.sql"
      );

    assert.match(
      repository,
      /cing_device_reauth_consume_rotate_v1/
    );

    assert.match(
      repository,
      /consumeAndRotate/
    );

    assert.match(
      service,
      /consumeAndRotate/
    );

    assert.doesNotMatch(
      service,
      /\.findBySelector\(/
    );

    assert.doesNotMatch(
      service,
      /\.markUsed\(/
    );

    assert.match(
      migration,
      /FOR UPDATE/
    );

    assert.match(
      migration,
      /token_selector = p_next_selector/
    );

    assert.match(
      migration,
      /token_hash = p_next_token_hash/
    );

    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION[\s\S]*FROM anon/
    );

    assert.match(
      migration,
      /REVOKE ALL ON FUNCTION[\s\S]*FROM authenticated/
    );

    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/
    );
  }
);

test(
  "recover response returns rotated device credential",
  () => {
    const source =
      read(
        "controllers/auth/authController.js"
      );

    assert.match(
      source,
      /credential:\s*result\.credential/
    );

    assert.match(
      source,
      /credential_expires_at:\s*result\.credentialExpiresAt/
    );
  }
);


test(
  "device reauth V2 is shell-binding based and does not depend on installation_id",
  () => {
    const service =
      read(
        "services/auth/deviceReauthService.js"
      );

    const repository =
      read(
        "repositories/auth/deviceReauthRepository.js"
      );

    const controller =
      read(
        "controllers/auth/authController.js"
      );

    const sql =
      read(
        "db/migrations/20260918_cing_device_reauth_sessions_v1.sql"
      );

    assert.match(
      service,
      /bindingId/
    );

    assert.match(
      repository,
      /binding_id/
    );

    assert.match(
      controller,
      /binding_id/
    );

    assert.match(
      sql,
      /binding_id text NOT NULL/
    );

    assert.doesNotMatch(
      service,
      /installationId/
    );

    assert.doesNotMatch(
      repository,
      /installation_id/
    );

    const registerStart =
      controller.indexOf(
        "async function registerDeviceReauth"
      );

    const recoverStart =
      controller.indexOf(
        "async function recoverDeviceReauth"
      );

    const logoutStart =
      controller.indexOf(
        "async function logout"
      );

    assert.ok(
      registerStart >= 0
    );

    assert.ok(
      recoverStart >
        registerStart
    );

    assert.ok(
      logoutStart >
        recoverStart
    );

    const region =
      controller.slice(
        registerStart,
        logoutStart
      );

    assert.doesNotMatch(
      region,
      /installation_id|installationId/
    );
  }
);


test(
  "device register requires backend-verified Zalo phone proof matching authenticated customer",
  () => {
    const source =
      read(
        "controllers/auth/authController.js"
      );

    const start =
      source.indexOf(
        "async function registerDeviceReauth"
      );

    const recover =
      source.indexOf(
        "async function recoverDeviceReauth"
      );

    assert.ok(start >= 0);
    assert.ok(recover > start);

    const region =
      source.slice(
        start,
        recover
      );

    assert.match(
      source,
      /decodePhoneToken/
    );

    assert.match(
      source,
      /normalizePhone/
    );

    assert.match(
      region,
      /STRONG_ZALO_PROOF_REQUIRED/
    );

    assert.match(
      region,
      /INVALID_ZALO_PHONE_PROOF/
    );

    assert.match(
      region,
      /verifiedPhone !==[\s\S]*customerPhone/
    );

    const verifyIndex =
      region.indexOf(
        "await decodePhoneToken"
      );

    const registerIndex =
      region.indexOf(
        "await deviceReauthService.register"
      );

    assert.ok(
      verifyIndex >= 0
    );

    assert.ok(
      registerIndex >
        verifyIndex
    );
  }
);

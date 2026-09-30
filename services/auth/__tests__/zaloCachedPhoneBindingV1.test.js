const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const source = fs.readFileSync(
  path.join(
    process.cwd(),
    "services/auth/authService.js"
  ),
  "utf8"
);

function loginSource() {
  const start =
    source.indexOf(
      "async function loginWithZalo"
    );

  const end =
    source.indexOf(
      "\nasync function refreshSession",
      start
    );

  assert.ok(start >= 0);
  assert.ok(end > start);

  return source.slice(start, end);
}

test(
  "fresh Zalo phone proof is always decoded before customer mutation",
  () => {
    const login = loginSource();

    assert.match(
      login,
      /const hasFreshPhoneProof[\s\S]*zaloUser\.phone_token[\s\S]*zaloUser\.mini_access_token/
    );

    assert.match(
      login,
      /if \(hasFreshPhoneProof\)[\s\S]*await decodePhoneToken/
    );

    assert.doesNotMatch(
      login,
      /phone_token && \(!zaloUser\.phone/
    );

    assert.ok(
      login.indexOf(
        "await decodePhoneToken"
      ) <
      login.indexOf(
        "await customerRepository.upsertCustomer({"
      )
    );
  }
);

test(
  "fresh proof rejects frontend phone mismatch",
  () => {
    const login = loginSource();

    assert.match(
      login,
      /presentedPhone !== verifiedPhone/
    );

    assert.match(
      login,
      /ZALO_PHONE_IDENTITY_MISMATCH/
    );
  }
);

test(
  "invalid fresh phone proof fails closed",
  () => {
    const login = loginSource();

    assert.match(
      login,
      /INVALID_ZALO_PHONE_PROOF/
    );

    assert.match(
      login,
      /!verifiedPhone[\s\S]*verifiedPhone\.length < 9/
    );
  }
);

test(
  "cached phone requires existing canonical phone and Zalo binding",
  () => {
    const login = loginSource();

    assert.match(
      source,
      /resolveCanonicalCachedMember/
    );

    assert.match(
      login,
      /await resolveCanonicalCachedMember\(\{[\s\S]*phone: presentedPhone,[\s\S]*zaloUserId: zaloId/
    );

    assert.match(
      login,
      /CACHED_MEMBER_IDENTITY_MISMATCH/
    );
  }
);

test(
  "cached phone can never establish a new binding before canonical validation",
  () => {
    const login = loginSource();

    const canonical =
      login.indexOf(
        "await resolveCanonicalCachedMember"
      );

    const upsert =
      login.indexOf(
        "await customerRepository.upsertCustomer({"
      );

    const access =
      login.indexOf(
        "generateAccessToken"
      );

    assert.ok(canonical >= 0);
    assert.ok(upsert > canonical);
    assert.ok(access > upsert);
  }
);

test(
  "canonical cached-member result owns the phone passed to upsert",
  () => {
    const login = loginSource();

    assert.match(
      login,
      /zaloUser\.phone\s*=\s*canonicalCachedMember\.phone/
    );
  }
);

test(
  "phone-only cached login cannot bypass Zalo identity",
  () => {
    const login = loginSource();

    assert.match(
      login,
      /if \(!zaloId\)[\s\S]*CACHED_MEMBER_IDENTITY_REQUIRED/
    );
  }
);

test(
  "login guard does not touch device reauth authority",
  () => {
    const login = loginSource();

    assert.doesNotMatch(
      login,
      /deviceReauthService\.(recover|register|revokeCustomer)/
    );
  }
);

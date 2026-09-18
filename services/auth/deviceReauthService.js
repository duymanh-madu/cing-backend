const crypto = require("crypto");

const {
  normalizePhone,
} = require("../../utils/phoneIdentity");

const CREDENTIAL_PREFIX = "dr1";
const SELECTOR_BYTES = 16;
const SECRET_BYTES = 32;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeBindingId(value) {
  const normalized =
    String(value || "").trim();

  if (normalized.length < 16) {
    return null;
  }

  return normalized;
}

function hashSecret(secret) {
  return crypto
    .createHash("sha256")
    .update(secret, "utf8")
    .digest("hex");
}

function generateCredential() {
  const selector =
    crypto
      .randomBytes(SELECTOR_BYTES)
      .toString("hex");

  const secret =
    crypto
      .randomBytes(SECRET_BYTES)
      .toString("base64url");

  return {
    selector,
    secret,
    credential:
      `${CREDENTIAL_PREFIX}.${selector}.${secret}`,
    tokenHash:
      hashSecret(secret),
  };
}

function parseCredential(value) {
  const raw =
    String(value || "").trim();

  const parts =
    raw.split(".");

  if (
    parts.length !== 3 ||
    parts[0] !== CREDENTIAL_PREFIX ||
    !/^[0-9a-f]{32}$/.test(parts[1]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[2])
  ) {
    return null;
  }

  return {
    selector:
      parts[1],
    secret:
      parts[2],
  };
}

function safeHashEqual(expectedHex, actualHex) {
  if (
    !/^[0-9a-f]{64}$/.test(
      String(expectedHex || "")
    ) ||
    !/^[0-9a-f]{64}$/.test(
      String(actualHex || "")
    )
  ) {
    return false;
  }

  const expected =
    Buffer.from(expectedHex, "hex");

  const actual =
    Buffer.from(actualHex, "hex");

  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(
      expected,
      actual
    )
  );
}

/*
 * Production-only member authority.
 *
 * Supabase is intentionally required inside the function,
 * not at module load time. Importing this service must remain
 * side-effect free so unit tests and tooling can inject all
 * dependencies without requiring production environment config.
 */
async function defaultMemberAuthority(customer) {
  const phone =
    normalizePhone(
      customer?.phone || ""
    );

  if (!phone || phone.length < 9) {
    return false;
  }

  const supabase =
    require("../../supabase");

  const {
    data,
    error,
  } = await supabase
    .from("players")
    .select(
      "user_id, member_activated"
    )
    .eq(
      "user_id",
      phone
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `device_reauth_member_lookup_failed: ${error.message}`
    );
  }

  return (
    data?.member_activated === true
  );
}

function createDeviceReauthService(options = {}) {
  /*
   * Resolve production dependencies lazily.
   * Supplied dependencies are never overridden.
   */
  const repository =
    options.repository ||
    require(
      "../../repositories/auth/deviceReauthRepository"
    );

  const customerRepository =
    options.customerRepository ||
    require(
      "../../repositories/customer/customerRepository"
    );

  const tokenService =
    options.tokenService ||
    require("./tokenService");

  const sessionRepository =
    options.sessionRepository ||
    require(
      "../../repositories/auth/sessionRepository"
    );

  const memberAuthority =
    options.memberAuthority ||
    defaultMemberAuthority;

  const now =
    options.now ||
    (() => Date.now());

  async function register({
    customer,
    bindingId,
  }) {
    if (!customer?.id) {
      return {
        ok: false,
        code: "INVALID_CUSTOMER",
      };
    }

    const normalizedBindingId =
      normalizeBindingId(
        bindingId
      );

    if (!normalizedBindingId) {
      return {
        ok: false,
        code: "INVALID_BINDING",
      };
    }

    const memberActive =
      await memberAuthority(customer);

    if (!memberActive) {
      return {
        ok: false,
        code: "MEMBER_NOT_ACTIVE",
      };
    }

    const generated =
      generateCredential();

    const expiresAt =
      new Date(
        now() + TTL_MS
      ).toISOString();

    await repository.rotateCredential({
      customerId:
        customer.id,
      bindingId:
        normalizedBindingId,
      selector:
        generated.selector,
      tokenHash:
        generated.tokenHash,
      expiresAt,
    });

    return {
      ok: true,
      credential:
        generated.credential,
      expiresAt,
    };
  }

  async function recover({
    bindingId,
    credential,
  }) {
    const normalizedBindingId =
      normalizeBindingId(
        bindingId
      );

    const parsed =
      parseCredential(
        credential
      );

    if (
      !normalizedBindingId ||
      !parsed
    ) {
      return {
        ok: false,
        code: "INVALID_CREDENTIAL",
      };
    }

    const presentedHash =
      hashSecret(
        parsed.secret
      );

    /*
     * Generate the next generation before touching DB.
     * The current credential is consumed and replaced
     * atomically by PostgreSQL.
     */
    const nextGeneration =
      generateCredential();

    const nextExpiresAt =
      new Date(
        now() + TTL_MS
      ).toISOString();

    const consumed =
      await repository
        .consumeAndRotate({
          currentSelector:
            parsed.selector,
          currentTokenHash:
            presentedHash,
          bindingId:
            normalizedBindingId,
          nextSelector:
            nextGeneration.selector,
          nextTokenHash:
            nextGeneration.tokenHash,
          nextExpiresAt,
        });

    if (!consumed?.customerId) {
      return {
        ok: false,
        code: "INVALID_CREDENTIAL",
      };
    }

    const customer =
      await customerRepository
        .findById(
          consumed.customerId
        );

    if (!customer?.id) {
      return {
        ok: false,
        code: "INVALID_CREDENTIAL",
      };
    }

    const memberActive =
      await memberAuthority(customer);

    if (!memberActive) {
      return {
        ok: false,
        code: "INVALID_CREDENTIAL",
      };
    }

    const accessToken =
      tokenService
        .generateAccessToken({
          customer,
        });

    const refreshToken =
      tokenService
        .generateRefreshToken({
          customer,
        });

    await sessionRepository
      .createSession({
        customerId:
          customer.id,
        refreshToken,
      });

    return {
      ok: true,
      customer,
      accessToken,
      refreshToken,
      credential:
        nextGeneration.credential,
      credentialExpiresAt:
        nextExpiresAt,
    };
  }

  async function revokeCustomer({
    customerId,
  }) {
    if (!customerId) {
      return;
    }

    await repository
      .revokeCustomer({
        customerId,
      });
  }

  return {
    register,
    recover,
    revokeCustomer,
  };
}

/*
 * Do NOT construct the production service at require-time.
 * This keeps module import free of Supabase/env side effects.
 */
let defaultService = null;

function getDefaultService() {
  if (!defaultService) {
    defaultService =
      createDeviceReauthService();
  }

  return defaultService;
}

module.exports = {
  register(...args) {
    return getDefaultService()
      .register(...args);
  },

  recover(...args) {
    return getDefaultService()
      .recover(...args);
  },

  revokeCustomer(...args) {
    return getDefaultService()
      .revokeCustomer(...args);
  },

  createDeviceReauthService,

  _internals: {
    normalizeBindingId,
    generateCredential,
    parseCredential,
    hashSecret,
    safeHashEqual,
    TTL_MS,
  },
};

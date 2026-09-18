const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  createDeviceReauthService,
  _internals,
} = require(
  "../deviceReauthService"
);

function makeHarness() {
  let row = null;
  let createdSession = null;
  let revokedCustomerId = null;

  const customer = {
    id: "customer-1",
    phone: "0912345678",
    name: "Cing iu",
  };

  const repository = {
    async rotateCredential(input) {
      row = {
        id: "device-row-1",
        customer_id:
          String(input.customerId),
        binding_id:
          input.bindingId,
        token_selector:
          input.selector,
        token_hash:
          input.tokenHash,
        expires_at:
          input.expiresAt,
        revoked_at:
          null,
      };
      return row;
    },

    async consumeAndRotate(input) {
      if (
        !row ||
        row.revoked_at ||
        row.token_selector !==
          input.currentSelector ||
        row.token_hash !==
          input.currentTokenHash ||
        row.binding_id !==
          input.bindingId ||
        Date.parse(row.expires_at) <=
          Date.parse("2026-09-18T13:00:00Z")
      ) {
        return null;
      }

      const result = {
        id:
          row.id,
        customerId:
          row.customer_id,
      };

      row = {
        ...row,
        token_selector:
          input.nextSelector,
        token_hash:
          input.nextTokenHash,
        expires_at:
          input.nextExpiresAt,
      };

      return result;
    },

    async revokeCustomer({
      customerId,
    }) {
      revokedCustomerId =
        String(customerId);

      if (
        row &&
        row.customer_id ===
          revokedCustomerId
      ) {
        row.revoked_at =
          new Date().toISOString();
      }
    },
  };

  const customerRepository = {
    async findById(id) {
      return (
        String(id) ===
        String(customer.id)
      )
        ? customer
        : null;
    },
  };

  const tokenService = {
    generateAccessToken() {
      return "access-token";
    },

    generateRefreshToken() {
      return "refresh-token";
    },
  };

  const sessionRepository = {
    async createSession(input) {
      createdSession = input;
    },
  };

  const service =
    createDeviceReauthService({
      repository,
      customerRepository,
      tokenService,
      sessionRepository,
      memberAuthority:
        async () => true,
      now:
        () =>
          Date.parse(
            "2026-09-18T13:00:00Z"
          ),
    });

  return {
    service,
    customer,
    repository,
    getRow:
      () => row,
    setRow:
      (value) => {
        row = value;
      },
    getCreatedSession:
      () => createdSession,
    getRevokedCustomerId:
      () => revokedCustomerId,
  };
}

test(
  "register stores only hash and returns opaque credential",
  async () => {
    const h =
      makeHarness();

    const result =
      await h.service.register({
        customer:
          h.customer,
        bindingId:
          "binding-1234567890",
      });

    assert.equal(
      result.ok,
      true
    );

    assert.match(
      result.credential,
      /^dr1\.[0-9a-f]{32}\.[A-Za-z0-9_-]+$/
    );

    const row =
      h.getRow();

    assert.match(
      row.token_hash,
      /^[0-9a-f]{64}$/
    );

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          row,
          "secret"
        ),
      false
    );

    assert.equal(
      row.token_hash.includes(
        result.credential
      ),
      false
    );
  }
);

test(
  "valid credential recovers canonical backend session",
  async () => {
    const h =
      makeHarness();

    const registered =
      await h.service.register({
        customer:
          h.customer,
        bindingId:
          "binding-1234567890",
      });

    const recovered =
      await h.service.recover({
        bindingId:
          "binding-1234567890",
        credential:
          registered.credential,
      });

    assert.equal(
      recovered.ok,
      true
    );

    assert.equal(
      recovered.accessToken,
      "access-token"
    );

    assert.equal(
      recovered.refreshToken,
      "refresh-token"
    );

    assert.deepEqual(
      h.getCreatedSession(),
      {
        customerId:
          "customer-1",
        refreshToken:
          "refresh-token",
      }
    );
  }
);

test(
  "wrong binding fails closed",
  async () => {
    const h =
      makeHarness();

    const registered =
      await h.service.register({
        customer:
          h.customer,
        bindingId:
          "binding-1234567890",
      });

    const recovered =
      await h.service.recover({
        bindingId:
          "different-binding-1234",
        credential:
          registered.credential,
      });

    assert.deepEqual(
      recovered,
      {
        ok: false,
        code:
          "INVALID_CREDENTIAL",
      }
    );
  }
);

test(
  "wrong secret fails closed",
  async () => {
    const h =
      makeHarness();

    const registered =
      await h.service.register({
        customer:
          h.customer,
        bindingId:
          "binding-1234567890",
      });

    const parsed =
      _internals
        .parseCredential(
          registered.credential
        );

    const tampered =
      `dr1.${parsed.selector}.${"x".repeat(43)}`;

    const recovered =
      await h.service.recover({
        bindingId:
          "binding-1234567890",
        credential:
          tampered,
      });

    assert.equal(
      recovered.ok,
      false
    );
  }
);

test(
  "revoked credential fails closed",
  async () => {
    const h =
      makeHarness();

    const registered =
      await h.service.register({
        customer:
          h.customer,
        bindingId:
          "binding-1234567890",
      });

    await h.service
      .revokeCustomer({
        customerId:
          h.customer.id,
      });

    const recovered =
      await h.service.recover({
        bindingId:
          "binding-1234567890",
        credential:
          registered.credential,
      });

    assert.equal(
      recovered.ok,
      false
    );

    assert.equal(
      h.getRevokedCustomerId(),
      "customer-1"
    );
  }
);

test(
  "inactive member cannot register",
  async () => {
    const service =
      createDeviceReauthService({
        repository: {},
        customerRepository: {},
        tokenService: {},
        sessionRepository: {},
        memberAuthority:
          async () => false,
      });

    const result =
      await service.register({
        customer: {
          id: "customer-1",
          phone: "0912345678",
        },
        bindingId:
          "binding-1234567890",
      });

    assert.deepEqual(
      result,
      {
        ok: false,
        code:
          "MEMBER_NOT_ACTIVE",
      }
    );
  }
);

test(
  "successful recover rotates credential and old credential cannot replay",
  async () => {
    const h =
      makeHarness();

    const registered =
      await h.service.register({
        customer:
          h.customer,
        bindingId:
          "binding-1234567890",
      });

    const first =
      await h.service.recover({
        bindingId:
          "binding-1234567890",
        credential:
          registered.credential,
      });

    assert.equal(
      first.ok,
      true
    );

    assert.match(
      first.credential,
      /^dr1\.[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/
    );

    assert.notEqual(
      first.credential,
      registered.credential
    );

    const replay =
      await h.service.recover({
        bindingId:
          "binding-1234567890",
        credential:
          registered.credential,
      });

    assert.equal(
      replay.ok,
      false
    );
  }
);

test(
  "rotated credential can recover next generation",
  async () => {
    const h =
      makeHarness();

    const registered =
      await h.service.register({
        customer:
          h.customer,
        bindingId:
          "binding-1234567890",
      });

    const first =
      await h.service.recover({
        bindingId:
          "binding-1234567890",
        credential:
          registered.credential,
      });

    const second =
      await h.service.recover({
        bindingId:
          "binding-1234567890",
        credential:
          first.credential,
      });

    assert.equal(
      second.ok,
      true
    );

    assert.notEqual(
      second.credential,
      first.credential
    );
  }
);

test(
  "unknown selector fails closed before auth session issuance",
  async () => {
    const h =
      makeHarness();

    const result =
      await h.service.recover({
        bindingId:
          "binding-1234567890",
        credential:
          `dr1.${"a".repeat(32)}.${"b".repeat(43)}`,
      });

    assert.equal(
      result.ok,
      false
    );

    assert.equal(
      h.getCreatedSession(),
      null
    );
  }
);

test(
  "malformed secret length fails closed",
  async () => {
    const h =
      makeHarness();

    const result =
      await h.service.recover({
        bindingId:
          "binding-1234567890",
        credential:
          `dr1.${"a".repeat(32)}.short`,
      });

    assert.equal(
      result.ok,
      false
    );

    assert.equal(
      h.getCreatedSession(),
      null
    );
  }
);

test(
  "deleted customer cannot receive backend auth tokens",
  async () => {
    const h =
      makeHarness();

    const registered =
      await h.service.register({
        customer:
          h.customer,
        bindingId:
          "binding-1234567890",
      });

    const service =
      createDeviceReauthService({
        repository:
          h.repository,
        customerRepository: {
          async findById() {
            return null;
          },
        },
        tokenService: {
          generateAccessToken() {
            throw new Error(
              "must not issue access"
            );
          },
          generateRefreshToken() {
            throw new Error(
              "must not issue refresh"
            );
          },
        },
        sessionRepository: {
          async createSession() {
            throw new Error(
              "must not create session"
            );
          },
        },
        memberAuthority:
          async () => true,
        now:
          () =>
            Date.parse(
              "2026-09-18T13:00:00Z"
            ),
      });

    const result =
      await service.recover({
        bindingId:
          "binding-1234567890",
        credential:
          registered.credential,
      });

    assert.equal(
      result.ok,
      false
    );
  }
);

test(
  "expired credential fails closed",
  async () => {
    const h =
      makeHarness();

    const registered =
      await h.service.register({
        customer:
          h.customer,
        bindingId:
          "binding-1234567890",
      });

    const row =
      h.getRow();

    h.setRow({
      ...row,
      expires_at:
        "2026-09-18T12:59:59Z",
    });

    const result =
      await h.service.recover({
        bindingId:
          "binding-1234567890",
        credential:
          registered.credential,
      });

    assert.equal(
      result.ok,
      false
    );

    assert.equal(
      h.getCreatedSession(),
      null
    );
  }
);

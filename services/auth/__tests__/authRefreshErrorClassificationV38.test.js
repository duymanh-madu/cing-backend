const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const jwt = require("jsonwebtoken");

const AppError = require("../../../utils/AppError");

const SECRET = "cing-v38-local-test-secret";

function loadService({
  findCustomer = async () => ({
    id: "customer-1",
    name: "Cing iu",
    phone: "",
  }),
  redisDel = async () => 1,
  refreshSecret = SECRET,
} = {}) {
  const filename = path.resolve(
    __dirname,
    "../authService.js"
  );

  const source = fs.readFileSync(
    filename,
    "utf8"
  );

  const moduleObject = {
    exports: {},
  };

  const dependencies = {
    jsonwebtoken: jwt,

    "../../utils/AppError":
      AppError,

    "./zaloPhoneService": {
      decodePhoneToken:
        async () => null,
    },

    "../infrastructure/cache/redisClient": {
      del: redisDel,
    },

    "../../repositories/customer/customerRepository": {
      findByIdForRefresh:
        findCustomer,

      findById() {
        throw new Error(
          "Legacy lookup used during refresh"
        );
      },
    },

    "../../repositories/auth/sessionRepository": {},

    "./tokenService": {
      generateAccessToken({
        customer,
      }) {
        return `access-for-${customer.id}`;
      },
    },

    "../../utils/phoneIdentity": {
      normalizePhone:
        value => value,
    },

    "../campaign/nationalDayLoginRewardService": {
      claimNationalDayLoginReward:
        async () => ({}),
    },

    "../loggerService": {
      warn() {},
      info() {},
      error() {},
    },
  };

  const sandbox = {
    module: moduleObject,
    exports: moduleObject.exports,

    require(id) {
      if (
        Object.prototype.hasOwnProperty.call(
          dependencies,
          id
        )
      ) {
        return dependencies[id];
      }

      throw new Error(
        `Unexpected import: ${id}`
      );
    },

    process: {
      env: {
        JWT_REFRESH_SECRET:
          refreshSecret,
      },
    },

    console: {
      log() {},
      warn() {},
      error() {},
    },

    Date,
    Buffer,
    setTimeout,
    clearTimeout,
  };

  vm.runInNewContext(
    source,
    sandbox,
    { filename }
  );

  return moduleObject.exports;
}

function token(
  payload = {
    customerId:
      "customer-1",
  },
  options = {}
) {
  return jwt.sign(
    payload,
    SECRET,
    options
  );
}

async function expectError(
  operation,
  statusCode,
  code
) {
  await assert.rejects(
    operation,
    error => {
      assert.equal(
        error instanceof AppError,
        true
      );

      assert.equal(
        error.statusCode,
        statusCode
      );

      assert.equal(
        error.code,
        code
      );

      return true;
    }
  );
}

test(
  "valid refresh preserves access-token response",
  async () => {
    const service =
      loadService();

    const result =
      await service.refreshSession({
        refreshToken:
          token(),
      });

    assert.equal(
      result.accessToken,
      "access-for-customer-1"
    );

    assert.equal(
      result.customer.id,
      "customer-1"
    );
  }
);

test(
  "expired refresh is definitive 401",
  async () => {
    const service =
      loadService();

    await expectError(
      service.refreshSession({
        refreshToken:
          token(
            {
              customerId:
                "customer-1",
            },
            {
              expiresIn: -1,
            }
          ),
      }),
      401,
      "INVALID_REFRESH_TOKEN"
    );
  }
);

test(
  "wrong signature is definitive 401",
  async () => {
    const service =
      loadService();

    const invalid =
      jwt.sign(
        {
          customerId:
            "customer-1",
        },
        "different-secret"
      );

    await expectError(
      service.refreshSession({
        refreshToken:
          invalid,
      }),
      401,
      "INVALID_REFRESH_TOKEN"
    );
  }
);

test(
  "missing token is 401",
  async () => {
    const service =
      loadService();

    await expectError(
      service.refreshSession({
        refreshToken:
          undefined,
      }),
      401,
      "INVALID_REFRESH_TOKEN"
    );
  }
);

test(
  "missing customer claim is 401",
  async () => {
    const service =
      loadService();

    await expectError(
      service.refreshSession({
        refreshToken:
          token({
            otherClaim:
              "value",
          }),
      }),
      401,
      "INVALID_REFRESH_TOKEN"
    );
  }
);

test(
  "missing customer is 401",
  async () => {
    const service =
      loadService({
        findCustomer:
          async () => null,
      });

    await expectError(
      service.refreshSession({
        refreshToken:
          token(),
      }),
      401,
      "REFRESH_CUSTOMER_NOT_FOUND"
    );
  }
);

test(
  "database failure remains 503",
  async () => {
    const service =
      loadService({
        findCustomer:
          async () => {
            throw new AppError({
              statusCode: 503,
              code:
                "AUTH_CUSTOMER_LOOKUP_UNAVAILABLE",
            });
          },
      });

    await expectError(
      service.refreshSession({
        refreshToken:
          token(),
      }),
      503,
      "AUTH_CUSTOMER_LOOKUP_UNAVAILABLE"
    );
  }
);

test(
  "missing server secret is 503",
  async () => {
    const service =
      loadService({
        refreshSecret: "",
      });

    await expectError(
      service.refreshSession({
        refreshToken:
          token(),
      }),
      503,
      "AUTH_REFRESH_UNAVAILABLE"
    );
  }
);

test(
  "Redis failure remains fail-open",
  async () => {
    const service =
      loadService({
        findCustomer:
          async () => ({
            id:
              "customer-1",
            name:
              "Cing iu",
            phone:
              "0900000000",
          }),

        redisDel:
          async () => {
            throw new Error(
              "Redis unavailable"
            );
          },
      });

    const result =
      await service.refreshSession({
        refreshToken:
          token(),
      });

    assert.equal(
      result.accessToken,
      "access-for-customer-1"
    );
  }
);

function loadRepository(
  result
) {
  const filename = path.resolve(
    __dirname,
    "../../../repositories/customer/customerRepository.js"
  );

  const source = fs.readFileSync(
    filename,
    "utf8"
  );

  const moduleObject = {
    exports: {},
  };

  const supabase = {
    from(table) {
      assert.equal(
        table,
        "customers"
      );

      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  if (
                    result instanceof Error
                  ) {
                    throw result;
                  }

                  return result;
                },
              };
            },
          };
        },
      };
    },
  };

  vm.runInNewContext(
    source,
    {
      module:
        moduleObject,

      exports:
        moduleObject.exports,

      require(id) {
        if (
          id ===
          "../../supabase"
        ) {
          return supabase;
        }

        if (
          id ===
          "../../utils/AppError"
        ) {
          return AppError;
        }

        throw new Error(
          `Unexpected repository import: ${id}`
        );
      },

      Date,
      Set,
      String,
    },
    { filename }
  );

  return moduleObject.exports;
}

test(
  "refresh lookup normalizes customer",
  async () => {
    const repository =
      loadRepository({
        data: {
          id:
            "customer-1",
          name:
            "Cing iu",
          phone:
            "0900000000",
        },
        error: null,
      });

    const customer =
      await repository.findByIdForRefresh(
        "customer-1"
      );

    assert.equal(
      customer.id,
      "customer-1"
    );
  }
);

test(
  "absent customer returns null",
  async () => {
    const repository =
      loadRepository({
        data: null,
        error: null,
      });

    const customer =
      await repository.findByIdForRefresh(
        "missing"
      );

    assert.equal(
      customer,
      null
    );
  }
);

test(
  "Supabase response error becomes 503",
  async () => {
    const repository =
      loadRepository({
        data: null,
        error: {
          message:
            "Database unavailable",
        },
      });

    await expectError(
      repository.findByIdForRefresh(
        "customer-1"
      ),
      503,
      "AUTH_CUSTOMER_LOOKUP_UNAVAILABLE"
    );
  }
);

test(
  "Supabase thrown error becomes 503",
  async () => {
    const repository =
      loadRepository(
        new Error(
          "Database connection failed"
        )
      );

    await expectError(
      repository.findByIdForRefresh(
        "customer-1"
      ),
      503,
      "AUTH_CUSTOMER_LOOKUP_UNAVAILABLE"
    );
  }
);

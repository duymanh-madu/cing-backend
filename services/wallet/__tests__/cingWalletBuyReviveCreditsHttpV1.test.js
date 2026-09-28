"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const root = path.resolve(__dirname, "../../..");

const route = fs.readFileSync(
  path.join(root, "routes/walletRoutes.js"),
  "utf8"
);

const calls = [];

let response = {
  data: null,
  error: null,
};

const fakeSupabase = {
  async rpc(name, args) {
    calls.push({ name, args });
    return response;
  },
};

const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  const service =
    parent?.filename?.endsWith(
      "cingWalletBuyReviveCreditsService.js"
    );

  if (service && request === "../../supabase") {
    return fakeSupabase;
  }

  if (
    service &&
    request === "../../utils/phoneIdentity"
  ) {
    return {
      normalizePhone(value) {
        return value === "0900000000"
          ? value
          : "";
      },
    };
  }

  return originalLoad.call(
    this,
    request,
    parent,
    isMain
  );
};

let buy;

try {
  ({
    buyReviveCreditsWithWallet: buy,
  } = require(
    "../cingWalletBuyReviveCreditsService"
  ));
} finally {
  Module._load = originalLoad;
}

const id =
  "11111111-1111-4111-8111-111111111111";

function input(overrides = {}) {
  return {
    customer: { phone: "0900000000" },
    quantity: 2,
    requestId: id,
    ...overrides,
  };
}

test("V1 and authenticated V2 routes coexist", () => {
  assert.equal(
    route.split('"/buy-plays"').length - 1,
    1
  );

  assert.match(
    route,
    /router\.post\(\s*"\/buy-revive-credits",\s*authMiddleware/
  );
});

test("V2 route uses canonical customer identity", () => {
  assert.match(
    route,
    /buyReviveCreditsWithWallet\(\{\s*customer:\s*req\.customer/
  );
});

test("invalid identity rejects before RPC", async () => {
  calls.length = 0;

  await assert.rejects(
    buy(input({ customer: null })),
    {
      code:
        "REVIVE_PURCHASE_MEMBER_IDENTITY_REQUIRED",
      statusCode: 401,
    }
  );

  assert.equal(calls.length, 0);
});

test("invalid quantity rejects before RPC", async () => {
  calls.length = 0;

  await assert.rejects(
    buy(input({ quantity: 0 })),
    {
      code: "REVIVE_PURCHASE_QUANTITY_INVALID",
      statusCode: 400,
    }
  );

  assert.equal(calls.length, 0);
});

test("invalid request ID rejects before RPC", async () => {
  calls.length = 0;

  await assert.rejects(
    buy(input({ requestId: "invalid" })),
    {
      code: "REVIVE_PURCHASE_REQUEST_ID_INVALID",
      statusCode: 400,
    }
  );

  assert.equal(calls.length, 0);
});

test("RPC receives only canonical purchase inputs", async () => {
  calls.length = 0;

  response = {
    error: null,
    data: [{
      applied: true,
      request_id: id,
      wallet_transaction_id: "wallet-tx",
      credit_transaction_id: 1,
      quantity: 2,
      unit_price: 2500,
      total_cost: 5000,
      wallet_balance_after: 15000,
      credit_balance_after: 2,
    }],
  };

  const result = await buy(input());

  assert.equal(result.applied, true);

  assert.deepEqual(calls, [{
    name:
      "cing_wallet_purchase_revive_credits_v1",
    args: {
      p_user_id: "0900000000",
      p_quantity: 2,
      p_request_id: id,
    },
  }]);
});

test("insufficient funds maps to 409", async () => {
  response = {
    data: null,
    error: {
      message:
        "CING_WALLET_INSUFFICIENT_BALANCE",
    },
  };

  await assert.rejects(
    buy(input()),
    {
      code:
        "CING_WALLET_INSUFFICIENT_BALANCE",
      statusCode: 409,
    }
  );
});

test("disabled price maps to 503", async () => {
  response = {
    data: null,
    error: {
      message:
        "REVIVE_PURCHASE_PRICE_NOT_CONFIGURED",
    },
  };

  await assert.rejects(
    buy(input()),
    {
      code:
        "REVIVE_PURCHASE_PRICE_NOT_CONFIGURED",
      statusCode: 503,
    }
  );
});

test("unexpected RPC response fails closed", async () => {
  response = {
    data: [],
    error: null,
  };

  await assert.rejects(
    buy(input()),
    {
      code:
        "REVIVE_PURCHASE_RESPONSE_INVALID",
      statusCode: 502,
    }
  );
});

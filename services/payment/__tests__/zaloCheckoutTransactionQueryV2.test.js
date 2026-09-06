const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const crypto =
  require("node:crypto");

const {
  DEFAULT_ENDPOINT,
  createZaloCheckoutStatusMac,
  classifyZaloCheckoutStatus,
  validateZaloCheckoutStatusResponse,
  queryZaloCheckoutTransaction,
} = require(
  "../zaloCheckoutTransactionQueryService"
);


test(
  "Zalo status MAC binds appId and orderId with the configured private key",
  () => {
    const privateKey =
      "private-test-key";

    const appId =
      "123456";

    const orderId =
      "PAY-ZALO-101";

    const expected =
      crypto
        .createHmac(
          "sha256",
          privateKey
        )
        .update(
          `appId=${appId}&orderId=${orderId}&privateKey=${privateKey}`
        )
        .digest("hex");

    assert.equal(
      createZaloCheckoutStatusMac({
        appId,
        orderId,
        privateKey,
      }),
      expected
    );
  }
);


test(
  "Zalo status result maps only documented final states to success or terminal failure",
  () => {
    assert.equal(
      classifyZaloCheckoutStatus(1),
      "success"
    );

    assert.equal(
      classifyZaloCheckoutStatus(-1),
      "terminal_failure"
    );

    assert.equal(
      classifyZaloCheckoutStatus(0),
      "pending"
    );

    assert.equal(
      classifyZaloCheckoutStatus(999),
      "pending"
    );
  }
);


test(
  "Zalo successful status proof requires canonical amount and provider transId",
  () => {
    const result =
      validateZaloCheckoutStatusResponse({
        response: {
          returnCode: 1,
          amount: 10000,
          transId:
            "ZALO-TRANS-101",
          merchantTransId:
            "PAY-ZALO-101",
          returnMessage:
            "success",
        },

        expectedOrderId:
          "PAY-ZALO-101",

        expectedAmount:
          10000,
      });

    assert.equal(
      result.classification,
      "success"
    );

    assert.throws(
      () =>
        validateZaloCheckoutStatusResponse({
          response: {
            returnCode: 1,
            amount: 20000,
            transId:
              "ZALO-TRANS-101",
            merchantTransId:
              "PAY-ZALO-101",
          },

          expectedOrderId:
            "PAY-ZALO-101",

          expectedAmount:
            10000,
        }),
      /ZALO_CHECKOUT_QUERY_AMOUNT_MISMATCH/
    );

    assert.throws(
      () =>
        validateZaloCheckoutStatusResponse({
          response: {
            returnCode: 1,
            amount: 10000,
            transId: "",
            merchantTransId:
              "PAY-ZALO-101",
          },

          expectedOrderId:
            "PAY-ZALO-101",

          expectedAmount:
            10000,
        }),
      /ZALO_CHECKOUT_QUERY_SUCCESS_TRANS_ID_REQUIRED/
    );
  }
);


test(
  "Zalo merchant transaction identity mismatch fails closed",
  () => {
    assert.throws(
      () =>
        validateZaloCheckoutStatusResponse({
          response: {
            returnCode: 1,
            amount: 10000,
            transId:
              "ZALO-TRANS-101",
            merchantTransId:
              "OTHER-PAYMENT",
          },

          expectedOrderId:
            "PAY-ZALO-101",

          expectedAmount:
            10000,
        }),
      /ZALO_CHECKOUT_QUERY_MERCHANT_TRANSACTION_MISMATCH/
    );
  }
);


test(
  "server status query sends MAC but never sends private key",
  async () => {
    let request = null;

    const httpClient = {
      async get(
        url,
        config
      ) {
        request = {
          url,
          config,
        };

        return {
          data: {
            returnCode: 1,
            amount: 10000,
            transId:
              "ZALO-TRANS-101",
            merchantTransId:
              "PAY-ZALO-101",
            returnMessage:
              "success",
          },
        };
      },
    };

    const result =
      await queryZaloCheckoutTransaction({
        transactionCode:
          "PAY-ZALO-101",

        amount:
          10000,

        env: {
          ZALO_CHECKOUT_APP_ID:
            "123456",

          ZALO_CHECKOUT_PRIVATE_KEY:
            "super-secret",
        },

        httpClient,
      });

    assert.equal(
      request.url,
      DEFAULT_ENDPOINT
    );

    assert.equal(
      request.config.params.appId,
      "123456"
    );

    assert.equal(
      request.config.params.orderId,
      "PAY-ZALO-101"
    );

    assert.ok(
      request.config.params.mac
    );

    assert.equal(
      Object.prototype.hasOwnProperty.call(
        request.config.params,
        "privateKey"
      ),
      false
    );

    assert.equal(
      result.classification,
      "success"
    );

    assert.equal(
      result.providerTransactionId,
      "ZALO-TRANS-101"
    );
  }
);

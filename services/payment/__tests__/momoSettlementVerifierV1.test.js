const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  buildMomoIpnRawSignature,
  createMomoIpnSignature,
  verifyMomoSettlement,
} = require(
  "../momoSettlementVerifier"
);

const config = {
  accessKey:
    "TEST_ACCESS_KEY",

  secretKey:
    "TEST_SECRET_KEY",

  partnerCode:
    "TEST_PARTNER",
};

function validPayload(
  overrides = {}
) {
  const payload = {
    partnerCode:
      config.partnerCode,

    orderId:
      "PAY-TEST-001",

    requestId:
      "PAY-TEST-001-REQUEST",

    amount:
      "12345",

    orderInfo:
      "Thanh toan test",

    orderType:
      "momo_wallet",

    transId:
      "999000111",

    resultCode:
      0,

    message:
      "Successful.",

    payType:
      "qr",

    responseTime:
      "1780000000000",

    extraData:
      "",

    ...overrides,
  };

  const rawSignature =
    buildMomoIpnRawSignature({
      accessKey:
        config.accessKey,
      payload,
    });

  payload.signature =
    createMomoIpnSignature({
      secretKey:
        config.secretKey,
      rawSignature,
    });

  return payload;
}

test(
  "MoMo verifier accepts valid HMAC callback",
  () => {
    const result =
      verifyMomoSettlement(
        validPayload(),
        config
      );

    assert.equal(
      result.provider,
      "momo"
    );

    assert.equal(
      result.transactionCode,
      "PAY-TEST-001"
    );

    assert.equal(
      result.providerTransactionId,
      "999000111"
    );

    assert.equal(
      result.amount,
      12345
    );

    assert.equal(
      result.succeeded,
      true
    );

    assert.equal(
      result.verificationMethod,
      "momo_hmac_sha256"
    );
  }
);

test(
  "MoMo verifier supports arbitrary whole-dong amounts",
  () => {
    const result =
      verifyMomoSettlement(
        validPayload({
          amount:
            "9751",
        }),
        config
      );

    assert.equal(
      result.amount,
      9751
    );
  }
);

test(
  "MoMo verifier rejects missing signature",
  () => {
    const payload =
      validPayload();

    delete payload.signature;

    assert.throws(
      () =>
        verifyMomoSettlement(
          payload,
          config
        ),
      /MOMO_SETTLEMENT_SIGNATURE_REQUIRED/
    );
  }
);

test(
  "MoMo verifier rejects forged signature",
  () => {
    const payload =
      validPayload();

    payload.signature =
      "0".repeat(64);

    assert.throws(
      () =>
        verifyMomoSettlement(
          payload,
          config
        ),
      /MOMO_SETTLEMENT_SIGNATURE_INVALID/
    );
  }
);

test(
  "MoMo verifier rejects partner mismatch",
  () => {
    const payload =
      validPayload({
        partnerCode:
          "OTHER_PARTNER",
      });

    assert.throws(
      () =>
        verifyMomoSettlement(
          payload,
          config
        ),
      /MOMO_SETTLEMENT_PARTNER_CODE_MISMATCH/
    );
  }
);

test(
  "MoMo verifier rejects amount tampering",
  () => {
    const payload =
      validPayload();

    payload.amount =
      "12346";

    assert.throws(
      () =>
        verifyMomoSettlement(
          payload,
          config
        ),
      /MOMO_SETTLEMENT_SIGNATURE_INVALID/
    );
  }
);

test(
  "MoMo verifier rejects fractional VND",
  () => {
    const payload =
      validPayload({
        amount:
          "12345.5",
      });

    assert.throws(
      () =>
        verifyMomoSettlement(
          payload,
          config
        ),
      /MOMO_SETTLEMENT_AMOUNT_INVALID/
    );
  }
);

test(
  "MoMo verifier preserves failed provider result without treating it as success",
  () => {
    const result =
      verifyMomoSettlement(
        validPayload({
          resultCode:
            1006,
        }),
        config
      );

    assert.equal(
      result.resultCode,
      1006
    );

    assert.equal(
      result.succeeded,
      false
    );
  }
);

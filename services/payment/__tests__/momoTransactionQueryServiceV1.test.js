const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  createQuerySignature,
  classifyMomoQueryResult,
  validateQueryResponse,
} = require(
  "../momoTransactionQueryService"
);


test(
  "MoMo query request signature uses official canonical fields",
  () => {
    const crypto =
      require("crypto");

    const raw =
      "accessKey=ACCESS" +
      "&orderId=PAY-1" +
      "&partnerCode=PARTNER" +
      "&requestId=REQ-1";

    const expected =
      crypto
        .createHmac(
          "sha256",
          "SECRET"
        )
        .update(raw)
        .digest("hex");

    assert.equal(
      createQuerySignature({
        accessKey:
          "ACCESS",
        orderId:
          "PAY-1",
        partnerCode:
          "PARTNER",
        requestId:
          "REQ-1",
        secretKey:
          "SECRET",
      }),
      expected
    );
  }
);


test(
  "MoMo result classification keeps pending states retryable",
  () => {
    for (
      const code of [
        1000,
        7000,
        7002,
        9000,
      ]
    ) {
      assert.equal(
        classifyMomoQueryResult(
          code
        ),
        "retry"
      );
    }
  }
);


test(
  "MoMo result classification recognizes final payment failures",
  () => {
    for (
      const code of [
        1001,
        1002,
        1003,
        1004,
        1005,
        1006,
        1007,
        1017,
        1026,
        4001,
        4002,
        4100,
      ]
    ) {
      assert.equal(
        classifyMomoQueryResult(
          code
        ),
        "terminal_failure"
      );
    }
  }
);


test(
  "unknown MoMo code never fails a possibly-paid transaction",
  () => {
    assert.equal(
      classifyMomoQueryResult(
        987654
      ),
      "retry"
    );
  }
);


test(
  "successful query response is strictly rebound to local payment identity",
  () => {
    const result =
      validateQueryResponse({
        response: {
          partnerCode:
            "PARTNER",
          requestId:
            "REQ-1",
          orderId:
            "PAY-1",
          amount:
            100000,
          transId:
            123456789,
          resultCode:
            0,
          message:
            "Successful.",
          responseTime:
            Date.now(),
        },
        expectedOrderId:
          "PAY-1",
        expectedRequestId:
          "REQ-1",
        expectedAmount:
          100000,
        partnerCode:
          "PARTNER",
      });

    assert.equal(
      result.classification,
      "success"
    );

    assert.equal(
      result.amount,
      100000
    );

    assert.equal(
      result.providerTransactionId,
      "123456789"
    );
  }
);


test(
  "query response rejects payment amount mismatch",
  () => {
    assert.throws(
      () =>
        validateQueryResponse({
          response: {
            partnerCode:
              "PARTNER",
            requestId:
              "REQ-1",
            orderId:
              "PAY-1",
            amount:
              99999,
            transId:
              123,
            resultCode:
              0,
          },
          expectedOrderId:
            "PAY-1",
          expectedRequestId:
            "REQ-1",
          expectedAmount:
            100000,
          partnerCode:
            "PARTNER",
        }),
      /MOMO_QUERY_AMOUNT_MISMATCH/
    );
  }
);


test(
  "query response rejects order identity mismatch",
  () => {
    assert.throws(
      () =>
        validateQueryResponse({
          response: {
            partnerCode:
              "PARTNER",
            requestId:
              "REQ-1",
            orderId:
              "PAY-OTHER",
            amount:
              100000,
            transId:
              123,
            resultCode:
              0,
          },
          expectedOrderId:
            "PAY-1",
          expectedRequestId:
            "REQ-1",
          expectedAmount:
            100000,
          partnerCode:
            "PARTNER",
        }),
      /MOMO_QUERY_ORDER_ID_MISMATCH/
    );
  }
);


test(
  "query response rejects request identity mismatch",
  () => {
    assert.throws(
      () =>
        validateQueryResponse({
          response: {
            partnerCode:
              "PARTNER",
            requestId:
              "REQ-WRONG",
            orderId:
              "PAY-1",
            amount:
              100000,
            transId:
              123,
            resultCode:
              0,
          },
          expectedOrderId:
            "PAY-1",
          expectedRequestId:
            "REQ-1",
          expectedAmount:
            100000,
          partnerCode:
            "PARTNER",
        }),
      /MOMO_QUERY_REQUEST_ID_MISMATCH/
    );
  }
);

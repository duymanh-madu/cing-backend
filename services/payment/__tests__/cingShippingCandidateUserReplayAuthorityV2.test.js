"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


function read(
  file
) {
  return fs.readFileSync(
    file,
    "utf8"
  );
}


const candidate =
  read(
    "services/deliveryLocationCandidateService.js"
  );

const typed =
  read(
    "services/typedDeliveryAddressResolutionService.js"
  );

const finalDestination =
  read(
    "services/finalDeliveryDestinationAuthorityService.js"
  );

const shippingRoute =
  read(
    "routes/shippingRoutes.js"
  );

const checkout =
  read(
    "routes/checkoutRoutes.js"
  );

const consume =
  read(
    "services/deliveryLocationCandidateConsumeService.js"
  );

const migration =
  read(
    "supabase/migrations/20260907073000_commerce_delivery_location_candidate_consume_v1.sql"
  );

const requestBoundMigration =
  read(
    "supabase/migrations/20260908183000_commerce_checkout_request_idempotency_v1.sql"
  );


test(
  "candidate V2 binds signed capability to authenticated canonical user",
  () => {
    assert.match(
      candidate,
      /cing_delivery_location_candidate_v2/
    );

    assert.match(
      candidate,
      /crypto\.randomUUID\(\)/
    );

    assert.match(
      candidate,
      /user_id/
    );

    assert.match(
      candidate,
      /expected_user_id/
    );

    assert.match(
      candidate,
      /DELIVERY_LOCATION_CANDIDATE_USER_MISMATCH/
    );
  }
);


test(
  "resolve-address is authenticated and never accepts client user identity",
  () => {
    assert.match(
      shippingRoute,
      /"\/resolve-address"[\s\S]{0,200}authMiddleware/
    );

    assert.match(
      shippingRoute,
      /normalizePhone\([\s\S]*req\.customer\?\.phone/
    );

    assert.match(
      shippingRoute,
      /resolveTypedDeliveryAddress\(\{[\s\S]*user_id:[\s\S]*canonicalUserId/
    );

    const start =
      shippingRoute.indexOf(
        '"/resolve-address"'
      );

    const end =
      shippingRoute.indexOf(
        '"/decode-location"',
        start
      );

    const region =
      shippingRoute.slice(
        start,
        end
      );

    assert.doesNotMatch(
      region,
      /user_id\s*:\s*req\.body/
    );
  }
);


test(
  "typed address issuance forwards canonical authenticated user",
  () => {
    assert.match(
      typed,
      /resolveTypedDeliveryAddress\(\{[\s\S]*user_id/
    );

    assert.match(
      typed,
      /createDeliveryLocationCandidate\(\{[\s\S]*user_id:[\s\S]*canonicalUserId/
    );
  }
);


test(
  "checkout verifies candidate against canonical authenticated user",
  () => {
    assert.match(
      checkout,
      /resolveFinalDeliveryDestination\(\{[\s\S]*user_id:[\s\S]*canonicalUserId/
    );

    assert.match(
      finalDestination,
      /verifyDeliveryLocationCandidate\([\s\S]*expected_user_id:[\s\S]*user_id/
    );
  }
);


test(
  "durable replay table is keyed by candidate jti",
  () => {
    assert.match(
      migration,
      /candidate_jti uuid primary key/
    );

    assert.match(
      migration,
      /consumed_at timestamptz not null/
    );

    assert.match(
      migration,
      /on conflict[\s\S]*candidate_jti[\s\S]*do nothing/
    );
  }
);


test(
  "candidate consume RPC performs zero financial mutation",
  () => {
    assert.doesNotMatch(
      migration,
      /\bplayers\b/
    );

    assert.doesNotMatch(
      migration,
      /\bpayment_transactions\b/
    );

    assert.doesNotMatch(
      migration,
      /\bcing_wallet_transactions\b/
    );

    assert.doesNotMatch(
      migration,
      /\bpoint_transactions\b/
    );

    assert.doesNotMatch(
      migration,
      /\borders\b/
    );
  }
);


test(
  "candidate consume authority is backend only",
  () => {
    assert.match(
      migration,
      /security definer/
    );

    assert.match(
      migration,
      /set search_path = public/
    );

    assert.match(
      migration,
      /revoke all[\s\S]*from anon/
    );

    assert.match(
      migration,
      /revoke all[\s\S]*from authenticated/
    );

    assert.match(
      migration,
      /grant execute[\s\S]*to service_role/
    );
  }
);


test(
  "Node adapter invokes bounded candidate consume RPC",
  () => {
    assert.match(
      consume,
      /cing_commerce_consume_delivery_location_candidate_v2/
    );

    assert.match(
      consume,
      /p_candidate_jti/
    );

    assert.match(
      consume,
      /p_user_id/
    );

    assert.match(
      consume,
      /p_expires_at/
    );

    assert.match(
      consume,
      /p_checkout_request_id/
    );

    assert.match(
      consume,
      /idempotentReplay/
    );

    assert.match(
      requestBoundMigration,
      /p_checkout_request_id uuid/
    );


    assert.match(
      consume,
      /DELIVERY_LOCATION_CANDIDATE_REPLAYED/
    );
  }
);


test(
  "candidate consume occurs after validation/readiness and before payment creation",
  () => {
    const validation =
      checkout.indexOf(
        "await validateCheckout("
      );

    const readiness =
      checkout.indexOf(
        "assertPointsOnlyCommerceReadiness()",
        validation
      );

    const consumeIndex =
      checkout.indexOf(
        "await consumeDeliveryLocationCandidate(",
        readiness
      );

    const payment =
      checkout.indexOf(
        "await createPaymentSession(",
        consumeIndex
      );

    assert.ok(
      validation >= 0
    );

    assert.ok(
      readiness > validation
    );

    assert.ok(
      consumeIndex > readiness
    );

    assert.ok(
      payment > consumeIndex
    );
  }
);


test(
  "candidate token user binding works at runtime",
  () => {
    const previous =
      process.env
        .SHIPPING_LOCATION_TOKEN_SECRET;

    process.env
      .SHIPPING_LOCATION_TOKEN_SECRET =
        "candidate-v2-test-secret-12345678901234567890";

    try {
      delete require.cache[
        require.resolve(
          "../../deliveryLocationCandidateService"
        )
      ];

      const {
        createDeliveryLocationCandidate,
        verifyDeliveryLocationCandidate,
      } =
        require(
          "../../deliveryLocationCandidateService"
        );

      const token =
        createDeliveryLocationCandidate({
          user_id:
            "0912345678",

          latitude:
            21.1,

          longitude:
            106.1,

          formatted_address:
            "Test",

          address_text:
            "Test",

          shipping_distance_km:
            1,

          shipping_fee:
            0,
        });

      const verified =
        verifyDeliveryLocationCandidate(
          token,
          {
            expected_user_id:
              "0912345678",
          }
        );

      assert.equal(
        verified.user_id,
        "0912345678"
      );

      assert.match(
        verified.jti,
        /^[0-9a-f-]{36}$/i
      );

      assert.throws(
        () =>
          verifyDeliveryLocationCandidate(
            token,
            {
              expected_user_id:
                "0999999999",
            }
          ),
        error =>
          error?.code ===
          "DELIVERY_LOCATION_CANDIDATE_USER_MISMATCH"
      );
    } finally {
      if (
        previous ===
        undefined
      ) {
        delete process.env
          .SHIPPING_LOCATION_TOKEN_SECRET;
      } else {
        process.env
          .SHIPPING_LOCATION_TOKEN_SECRET =
            previous;
      }
    }
  }
);

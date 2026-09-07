"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const route =
  fs.readFileSync(
    "routes/checkoutRoutes.js",
    "utf8"
  );

const orchestrator =
  fs.readFileSync(
    "services/payment/paymentOrchestratorService.js",
    "utf8"
  );

const processor =
  fs.readFileSync(
    "services/payment/paidOrderSettlementProcessor.js",
    "utf8"
  );

const pointsService =
  fs.readFileSync(
    "services/payment/commercePointsOnlySettlementService.js",
    "utf8"
  );


test(
  "authenticated checkout forwards points_requested to canonical validation",
  () => {

    const create =
      route.slice(
        route.indexOf('"/create"')
      );

    assert.match(
      create,
      /points_requested\s*=\s*0/
    );

    assert.match(
      create,
      /await validateCheckout\(\{[\s\S]*points_requested/
    );

  }
);


test(
  "canonical point fields are frozen into payment snapshot",
  () => {

    for (
      const field
      of [
        "pre_points_payable",
        "points_requested",
        "points_used",
        "point_value_vnd",
        "points_discount",
        "remaining_payable",
      ]
    ) {

      assert.match(
        route,
        new RegExp(
          `${field}:[\\s\\S]*validationResult\\.${field}`
        )
      );

    }

  }
);


test(
  "full point coverage derives points internal tender",
  () => {

    assert.match(
      route,
      /const isPointsOnly[\s\S]*remaining_payable[\s\S]*points_used/
    );

    assert.match(
      route,
      /canonicalPaymentMethod[\s\S]*\?\s*"points"[\s\S]*:\s*payment_method/
    );

    assert.match(
      route,
      /canonicalPaymentProvider[\s\S]*\?\s*"internal"[\s\S]*:\s*payment_provider/
    );

  }
);


test(
  "payment session receives canonical tender and canonical remainder",
  () => {

    assert.match(
      route,
      /payment_provider:\s*canonicalPaymentProvider/
    );

    assert.match(
      route,
      /payment_method:\s*canonicalPaymentMethod/
    );

    assert.match(
      route,
      /total_amount:\s*validationResult\.total_amount/
    );

  }
);


test(
  "orchestrator reserves points before selecting internal points rail",
  () => {

    const reserve =
      orchestrator.indexOf(
        "await reservePaymentPoints"
      );

    const internal =
      orchestrator.indexOf(
        "Points-only is an internal zero-money rail"
      );

    const wallet =
      orchestrator.indexOf(
        "Cing Wallet is an internal settlement rail"
      );

    const provider =
      orchestrator.indexOf(
        "provider.createPayment",
        wallet
      );

    assert.ok(reserve >= 0);
    assert.ok(internal > reserve);
    assert.ok(wallet > internal);
    assert.ok(provider > wallet);

  }
);


test(
  "points internal rail never invokes provider",
  () => {

    const start =
      orchestrator.indexOf(
        "Points-only is an internal zero-money rail"
      );

    const end =
      orchestrator.indexOf(
        "Cing Wallet is an internal settlement rail",
        start
      );

    const region =
      orchestrator.slice(
        start,
        end
      );

    assert.match(
      region,
      /payment_method ===[\s\S]*"points"/
    );

    assert.match(
      region,
      /payment_provider ===[\s\S]*"internal"/
    );

    assert.match(
      region,
      /Number\(payload\.total_amount\) ===[\s\S]*0/
    );

    assert.doesNotMatch(
      region,
      /provider\.createPayment/
    );

  }
);


test(
  "points-only service settles financially before shared commerce completion",
  () => {

    const settlement =
      pointsService.indexOf(
        "await settlePointsOnlyPayment"
      );

    const completion =
      pointsService.indexOf(
        "await processPaidOrderSettlement"
      );

    assert.ok(settlement >= 0);
    assert.ok(completion > settlement);

  }
);


test(
  "points-only handoff passes zero monetary amount to shared completion",
  () => {

    assert.match(
      pointsService,
      /processPaidOrderSettlement\(\{[\s\S]*amount:\s*0/
    );

  }
);


test(
  "shared completion preserves internal points settlement proof",
  () => {

    assert.match(
      processor,
      /const isInternalSettlement/
    );

    assert.match(
      processor,
      /payment\.payment_method ===[\s\S]*"points"[\s\S]*payment\.payment_provider ===[\s\S]*"internal"[\s\S]*commerce_points_internal_atomic/
    );

    assert.match(
      processor,
      /if \(!isInternalSettlement\)/
    );

  }
);


test(
  "Wallet route uses canonical tender after points-only derivation",
  () => {

    assert.match(
      route,
      /canonicalPaymentMethod ===[\s\S]*"cing_wallet"/
    );

  }
);

"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const source =
  fs.readFileSync(
    "routes/checkoutRoutes.js",
    "utf8"
  );


test(
  "checkout explicitly accepts current candidate_token contract",
  () => {
    assert.match(
      source,
      /delivery_location_source,[\s\S]*candidate_token,[\s\S]*delivery_location_candidate_token,[\s\S]*order_type/
    );
  }
);


test(
  "legacy candidate field remains compatibility-only alias",
  () => {
    assert.match(
      source,
      /function getIncomingDeliveryCandidateToken\(req\)/
    );

    assert.match(
      source,
      /req\.body\?\.candidate_token/
    );

    assert.match(
      source,
      /req\.body\?\.delivery_location_candidate_token/
    );
  }
);


test(
  "conflicting direct and legacy capabilities fail closed",
  () => {
    const start =
      source.indexOf(
        "function getIncomingDeliveryCandidateToken"
      );

    const end =
      source.indexOf(
        "/**",
        start
      );

    const region =
      source.slice(
        start,
        end
      );

    assert.match(
      region,
      /direct[\s\S]*legacy[\s\S]*direct !== legacy/
    );

    assert.match(
      region,
      /DELIVERY_LOCATION_CANDIDATE_TOKEN_CONFLICT/
    );

    assert.match(
      region,
      /statusCode =[\s\S]*400/
    );
  }
);


test(
  "current candidate token has canonical precedence",
  () => {
    const start =
      source.indexOf(
        "function getIncomingDeliveryCandidateToken"
      );

    const end =
      source.indexOf(
        "/**",
        start
      );

    const region =
      source.slice(
        start,
        end
      );

    assert.match(
      region,
      /return \([\s\S]*direct[\s\S]*legacy[\s\S]*null/
    );
  }
);


test(
  "canonical candidate is derived only after authenticated customer identity",
  () => {
    const user =
      source.indexOf(
        "canonicalUserId"
      );

    const candidate =
      source.indexOf(
        "canonicalDeliveryCandidateToken",
        user
      );

    const destination =
      source.indexOf(
        "resolveFinalDeliveryDestination",
        candidate
      );

    assert.ok(
      user >= 0
    );

    assert.ok(
      candidate > user
    );

    assert.ok(
      destination > candidate
    );
  }
);


test(
  "final destination receives canonical candidate capability",
  () => {
    assert.match(
      source,
      /resolveFinalDeliveryDestination\([\s\S]*candidate_token:[\s\S]*canonicalDeliveryCandidateToken/
    );

    assert.doesNotMatch(
      source,
      /candidate_token:\s*delivery_location_candidate_token/
    );
  }
);


test(
  "candidate verify validate consume payment ordering remains stable",
  () => {
    const user =
      source.indexOf(
        "canonicalUserId"
      );

    const destination =
      source.indexOf(
        "resolveFinalDeliveryDestination",
        user
      );

    const validation =
      source.indexOf(
        "validateCheckout",
        destination
      );

    const consume =
      source.indexOf(
        "consumeDeliveryLocationCandidate",
        validation
      );

    const payment =
      source.indexOf(
        "createPaymentSession",
        consume
      );

    assert.ok(
      user
      <
      destination
    );

    assert.ok(
      destination
      <
      validation
    );

    assert.ok(
      validation
      <
      consume
    );

    assert.ok(
      consume
      <
      payment
    );
  }
);


test(
  "takeaway compatibility remains canonicalized to pickup",
  () => {
    assert.match(
      source,
      /\["pickup",\s*"takeaway",[\s\S]*\]\.includes\(raw\)[\s\S]*return "pickup"/
    );
  }
);

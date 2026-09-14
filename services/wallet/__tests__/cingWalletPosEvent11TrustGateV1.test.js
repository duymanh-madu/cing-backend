const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const test =
  require("node:test");


const source =
  fs.readFileSync(
    "routes/iposWebhookRoutes.js",
    "utf8"
  );


function trustHelper() {
  const start =
    source.indexOf(
      "function isCingWalletPosEvent11TrustEnabled"
    );

  const end =
    source.indexOf(
      "\n}",
      start
    );

  assert.ok(
    start >= 0 &&
    end > start
  );

  return source.slice(
    start,
    end + 2
  );
}


function event11Lane() {
  const start =
    source.indexOf(
      "CING WALLET POS EVENT 11 RECONCILIATION LANE"
    );

  const end =
    source.indexOf(
      "MENU REALTIME EVENTS",
      start
    );

  assert.ok(
    start >= 0 &&
    end > start
  );

  return source.slice(
    start,
    end
  );
}


function event2Lane() {
  const start =
    source.indexOf(
      "CING WALLET POS EVENT 2 SYNCHRONOUS LANE"
    );

  const end =
    source.indexOf(
      "res.json({ success: true })",
      start
    );

  assert.ok(
    start >= 0 &&
    end > start
  );

  return source.slice(
    start,
    end
  );
}


test(
  "Event11 trust defaults to empty string and exact true only",
  () => {
    const helper =
      trustHelper();

    assert.match(
      helper,
      /CING_WALLET_POS_EVENT11_TRUST_ENABLED/
    );

    assert.match(
      helper,
      /\|\|\s*[\r\n\s]*""/
    );

    assert.match(
      helper,
      /\.trim\(\)/
    );

    assert.match(
      helper,
      /\.toLowerCase\(\)/
    );

    assert.match(
      helper,
      /===\s*[\r\n\s]*"true"/
    );

    assert.doesNotMatch(
      helper,
      /\|\|\s*[\r\n\s]*"true"/
    );

    assert.doesNotMatch(
      helper,
      /\|\|\s*[\r\n\s]*true\b/
    );
  }
);


test(
  "Event11 reconciliation requires explicit trust",
  () => {
    const lane =
      event11Lane();

    assert.match(
      lane,
      /event ===[\s\S]*"sale_manager"/
    );

    assert.match(
      lane,
      /body\.event_id/
    );

    assert.match(
      lane,
      /isCingWalletPosEvent11TrustEnabled\(\)/
    );

    assert.match(
      lane,
      /await reconcileIposEvent11\([\s\S]*body/
    );
  }
);


test(
  "Event11 lane remains non financial",
  () => {
    const lane =
      event11Lane();

    for (
      const forbidden
      of [
        "cing_wallet_settle_pos_payment_atomic_v1",
        "cing_wallet_apply_mutation_private",
        "cing_wallet_accounts",
        "cing_wallet_transactions",
      ]
    ) {
      assert.equal(
        lane.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);


test(
  "Event2 is not gated by Event11 trust",
  () => {
    const lane =
      event2Lane();

    assert.match(
      lane,
      /isCingWalletPosTriggerRequest/
    );

    assert.match(
      lane,
      /handleIposUsingVoucher/
    );

    assert.doesNotMatch(
      lane,
      /EVENT11_TRUST/
    );

    assert.doesNotMatch(
      lane,
      /isCingWalletPosEvent11TrustEnabled/
    );
  }
);


test(
  "legacy webhook continues after Event11 lane",
  () => {
    const event11At =
      source.indexOf(
        "CING WALLET POS EVENT 11 RECONCILIATION LANE"
      );

    const menuAt =
      source.indexOf(
        "MENU REALTIME EVENTS",
        event11At
      );

    const dedupAt =
      source.indexOf(
        "const uniqueId =",
        event11At
      );

    const memberAt =
      source.indexOf(
        "getMember(phone)",
        event11At
      );

    assert.ok(
      menuAt > event11At
    );

    assert.ok(
      dedupAt > event11At
    );

    assert.ok(
      memberAt > event11At
    );
  }
);


test(
  "trust gate is isolation and not webhook authentication",
  () => {
    const helper =
      trustHelper();

    assert.doesNotMatch(
      helper,
      /authorization|signature|hmac|timingSafeEqual/i
    );
  }
);

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const validator = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../checkoutValidationService.js"
  ),
  "utf8"
);

const route = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../../routes/checkoutRoutes.js"
  ),
  "utf8"
);

const processor = fs.readFileSync(
  path.resolve(
    __dirname,
    "../paidOrderSettlementProcessor.js"
  ),
  "utf8"
);

test(
  "checkout resolves canonical tier from players.crm_tier",
  () => {
    assert.match(
      validator,
      /resolveCanonicalCommerceTier[\s\S]*from\("players"\)[\s\S]*select\("crm_tier"\)[\s\S]*user_id/
    );
  }
);

test(
  "checkout uses existing membership discount policy",
  () => {
    assert.match(
      validator,
      /calculateOrderDiscount\([\s\S]*subtotal[\s\S]*tier_key/
    );
  }
);

test(
  "canonical total subtracts server-derived tier discount",
  () => {

    /*
     * Tier discount is now part of the canonical pre-points
     * payable equation.
     *
     * Loyalty redemption runs after tier pricing, therefore
     * expected_total_amount is the remaining payable after
     * points rather than the raw subtotal/shipping/tier equation.
     */
    assert.match(
      validator,
      /const pre_points_payable\s*=[\s\S]*subtotal[\s\S]*shippingResult\.shipping_fee[\s\S]*voucher_discount[\s\S]*tier_discount/
    );

    assert.match(
      validator,
      /const expected_total_amount\s*=\s*remaining_payable/
    );

  }
);

test(
  "checkout create supplies authenticated canonical identity",
  () => {
    const start =
      route.search(
        /router\.post\(\s*["']\/create["']/
      );

    const payment =
      route.indexOf(
        "CREATE PAYMENT SESSION",
        start
      );

    assert.ok(start >= 0);
    assert.ok(payment > start);

    const region =
      route.slice(start, payment);

    assert.match(
      region,
      /await validateCheckout\(\{[\s\S]*user_id:[\s\S]*canonicalUserId/
    );
  }
);

test(
  "client request cannot provide tier authority",
  () => {
    const start =
      route.search(
        /router\.post\(\s*["']\/create["']/
      );

    const identity =
      route.indexOf(
        "const canonicalUserId",
        start
      );

    const region =
      route.slice(
        start,
        identity
      );

    assert.doesNotMatch(
      region,
      /\btier_key\b|\btier_discount\b/
    );
  }
);

test(
  "payment snapshot freezes canonical tier key and discount",
  () => {
    assert.match(
      route,
      /cart_snapshot:\s*\{[\s\S]*tier_key:[\s\S]*validationResult\.tier_key[\s\S]*tier_discount:[\s\S]*validationResult\.tier_discount/
    );
  }
);

test(
  "paid order materialization consumes frozen tier discount",
  () => {
    assert.match(
      processor,
      /tier_discount:\s*snap\.tier_discount\s*\?\?\s*0/
    );
  }
);

"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");


const orderRoute =
  fs.readFileSync(
    "routes/orderRoutes.js",
    "utf8"
  );

const paymentRoute =
  fs.readFileSync(
    "routes/paymentRoutes.js",
    "utf8"
  );


function routeSection(
  source,
  marker
) {
  const start =
    source.indexOf(
      marker
    );

  assert.ok(
    start >= 0
  );

  const nextRouter =
    source.indexOf(
      "router.",
      start + marker.length
    );

  const end =
    nextRouter > start
      ? nextRouter
      : source.length;

  return source.slice(
    start,
    end
  );
}


test(
  "commerce order creation requires authenticated customer",
  () => {
    const section =
      routeSection(
        orderRoute,
        '"/create"'
      );

    assert.match(
      section,
      /authMiddleware/
    );
  }
);


test(
  "commerce payment session requires authenticated customer",
  () => {
    const section =
      routeSection(
        paymentRoute,
        '"/create-session"'
      );

    assert.match(
      section,
      /authMiddleware/
    );
  }
);


test(
  "legacy order creation is authenticated but has no ownership mutation authority",
  () => {

    const section =
      routeSection(
        orderRoute,
        '"/create"'
      );

    assert.match(
      section,
      /authMiddleware/
    );

    assert.match(
      section,
      /canonicalUserId[\s\S]*normalizePhone\([\s\S]*req\.customer\?\.phone/
    );

    assert.match(
      section,
      /status\(410\)/
    );

    assert.match(
      section,
      /COMMERCE_CHECKOUT_ENDPOINT_REQUIRED/
    );

    assert.doesNotMatch(
      section,
      /createOrder\(/
    );

    assert.doesNotMatch(
      section,
      /\.\.\.body/
    );

  }
);


test(
  "deprecated payment creation route remains behind authenticated customer identity",
  () => {

    const section =
      routeSection(
        paymentRoute,
        '"/create-session"'
      );

    assert.match(
      section,
      /authMiddleware/
    );

    assert.match(
      section,
      /canonicalUserId[\s\S]*normalizePhone\([\s\S]*req\.customer\?\.phone/
    );

    assert.match(
      section,
      /status\(410\)[\s\S]*COMMERCE_CHECKOUT_ENDPOINT_REQUIRED/
    );

    assert.doesNotMatch(
      section,
      /createPaymentSession\(/
    );

    assert.doesNotMatch(
      section,
      /\.\.\.req\.body/
    );

  }
);

test(
  "caller controlled order user_id is no longer required",
  () => {
    const section =
      routeSection(
        orderRoute,
        '"/create"'
      );

    assert.doesNotMatch(
      section,
      /!body\.user_id/
    );

    assert.doesNotMatch(
      section,
      /Missing user_id/
    );
  }
);


test(
  "commerce checkout owns identity while deprecated payment route has zero financial authority",
  () => {

    /*
     * This file historically owns orderRoute/paymentRoute fixtures,
     * but has no canonical checkout source fixture.
     *
     * Read the canonical checkout route explicitly here rather than
     * introducing a misleading shared alias.
     */
    const canonicalCheckoutRoute =
      fs.readFileSync(
        "routes/checkoutRoutes.js",
        "utf8"
      );

    assert.match(
      canonicalCheckoutRoute,
      /const canonicalUserId =[\s\S]*normalizePhone\([\s\S]*req\.customer\?\.phone/
    );

    assert.match(
      canonicalCheckoutRoute,
      /await validateCheckout\(\{[\s\S]*user_id:[\s\S]*canonicalUserId/
    );

    assert.match(
      canonicalCheckoutRoute,
      /await createPaymentSession\(\{[\s\S]*user_id:[\s\S]*canonicalUserId/
    );

    assert.match(
      canonicalCheckoutRoute,
      /customer_phone:[\s\S]*canonicalUserId/
    );


    const payment =
      routeSection(
        paymentRoute,
        '"/create-session"'
      );

    assert.match(
      payment,
      /authMiddleware/
    );

    assert.match(
      payment,
      /status\(410\)/
    );

    assert.match(
      payment,
      /COMMERCE_CHECKOUT_ENDPOINT_REQUIRED/
    );

    assert.match(
      payment,
      /\/api\/checkout\/create/
    );

    assert.doesNotMatch(
      payment,
      /createPaymentSession\(/
    );

    assert.doesNotMatch(
      payment,
      /\.\.\.req\.body/
    );

  }
);


test(
  "commerce ownership fails closed without canonical authenticated identity",
  () => {
    for (
      const section of [
        routeSection(
          orderRoute,
          '"/create"'
        ),
        routeSection(
          paymentRoute,
          '"/create-session"'
        ),
      ]
    ) {
      assert.match(
        section,
        /COMMERCE_CUSTOMER_IDENTITY_REQUIRED/
      );

      assert.match(
        section,
        /status\(401\)/
      );
    }
  }
);

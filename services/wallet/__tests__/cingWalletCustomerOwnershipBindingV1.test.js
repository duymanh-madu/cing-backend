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
  "order ownership derives only from authenticated customer phone",
  () => {
    const section =
      routeSection(
        orderRoute,
        '"/create"'
      );

    assert.match(
      section,
      /canonicalUserId[\s\S]*normalizePhone\([\s\S]*req\.customer\?\.phone/
    );

    assert.match(
      section,
      /createOrder\(\{[\s\S]*\.\.\.body[\s\S]*user_id:[\s\S]*canonicalUserId[\s\S]*customer_phone:[\s\S]*canonicalUserId/
    );
  }
);


test(
  "payment ownership derives only from authenticated customer phone",
  () => {
    const section =
      routeSection(
        paymentRoute,
        '"/create-session"'
      );

    assert.match(
      section,
      /canonicalUserId[\s\S]*normalizePhone\([\s\S]*req\.customer\?\.phone/
    );

    assert.match(
      section,
      /createPaymentSession\(\{[\s\S]*\.\.\.req\.body[\s\S]*user_id:[\s\S]*canonicalUserId[\s\S]*customer_phone:[\s\S]*canonicalUserId[\s\S]*payment_purpose:[\s\S]*"order"/
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
  "canonical identity overrides caller identity after payload expansion",
  () => {
    const order =
      routeSection(
        orderRoute,
        '"/create"'
      );

    const payment =
      routeSection(
        paymentRoute,
        '"/create-session"'
      );

    const oSpread =
      order.indexOf(
        "...body"
      );

    const oUser =
      order.indexOf(
        "user_id:",
        oSpread
      );

    const oPhone =
      order.indexOf(
        "customer_phone:",
        oUser
      );

    assert.ok(
      oSpread >= 0 &&
      oSpread < oUser &&
      oUser < oPhone
    );


    const pSpread =
      payment.indexOf(
        "...req.body"
      );

    const pUser =
      payment.indexOf(
        "user_id:",
        pSpread
      );

    const pPhone =
      payment.indexOf(
        "customer_phone:",
        pUser
      );

    assert.ok(
      pSpread >= 0 &&
      pSpread < pUser &&
      pUser < pPhone
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

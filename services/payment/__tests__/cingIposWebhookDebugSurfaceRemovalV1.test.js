"use strict";

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

test(
  "production iPOS webhook router exposes no debug endpoints",
  () => {
    const forbidden = [
      'router.post("/test"',
      'router.get("/last-callback"',
      'router.get("/test-update-point"',
    ];

    for (const marker of forbidden) {
      assert.equal(
        source.includes(marker),
        false,
        marker
      );
    }
  }
);

test(
  "production webhook does not retain raw callback headers and body in Redis",
  () => {
    assert.equal(
      source.includes(
        "foodbook:last_callback"
      ),
      false
    );

    assert.equal(
      source.includes(
        "JSON.stringify({ headers: req.headers, body"
      ),
      false
    );
  }
);

test(
  "production webhook router contains no debug point mutation",
  () => {
    assert.equal(
      source.includes(
        "/ipos/ws/partner/mbs/update_point"
      ),
      false
    );

    assert.equal(
      source.includes(
        '"type_change",  "MINUS"'
      ),
      false
    );

    assert.equal(
      source.includes(
        '"point_change", "1"'
      ),
      false
    );

    assert.equal(
      source.includes(
        "Test tru diem tu app Railway"
      ),
      false
    );
  }
);

test(
  "canonical iPOS callback surfaces remain intact",
  () => {
    assert.ok(
      source.includes(
        'router.post("/callback"'
      )
    );

    assert.ok(
      source.includes(
        'router.post("/member-updated"'
      )
    );

    assert.ok(
      source.includes(
        'router.post("/order-completed"'
      )
    );

    assert.ok(
      source.includes(
        "CING WALLET POS EVENT 2 SYNCHRONOUS LANE"
      )
    );

    assert.ok(
      source.includes(
        "reconcileIposEvent11"
      )
    );
  }
);

test(
  "Event 2 discovery remains before generic webhook ACK",
  () => {
    const event2 =
      source.indexOf(
        "CING WALLET POS EVENT 2 SYNCHRONOUS LANE"
      );

    const genericAck =
      source.indexOf(
        "res.json({ success: true });"
      );

    assert.ok(
      event2 >= 0
    );

    assert.ok(
      genericAck > event2
    );
  }
);

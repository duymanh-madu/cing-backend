"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const sql =
  fs.readFileSync(
    "db/migrations/20260827_cing_commerce_post_order_effect_authority_v1.sql",
    "utf8"
  );


test(
  "historical replay fence targets exact four audited commerce orders",
  () => {
    for (const orderId of [
      377,
      379,
      382,
      387,
    ]) {
      assert.match(
        sql,
        new RegExp(
          `\\b${orderId}\\b`
        )
      );
    }

    for (const eventId of [
      2225,
      2314,
      3180,
      3717,
    ]) {
      assert.match(
        sql,
        new RegExp(
          `\\b${eventId}\\b`
        )
      );
    }
  }
);


test(
  "historical backfill fails closed on canonical payment authority",
  () => {
    assert.match(
      sql,
      /COMMERCE_ORDER_SPEND_PLAY_BACKFILL_PAYMENT_AUTHORITY_CHANGED/
    );

    assert.match(
      sql,
      /payment_transactions[\s\S]*payment_status = 'paid'[\s\S]*payment_purpose = 'order'[\s\S]*order_created is true[\s\S]*order_id = o\.id/i
    );
  }
);


test(
  "historical event arithmetic is asserted before reconstruction",
  () => {
    assert.match(
      sql,
      /COMMERCE_ORDER_SPEND_PLAY_BACKFILL_EVENT_SHAPE_CHANGED/
    );

    assert.match(
      sql,
      /new_total[\s\S]*amount/i
    );
  }
);


test(
  "historical backfill writes authoritative game play ledger only",
  () => {
    const marker =
      sql.indexOf(
        "ORDER-SPEND GAME PLAY HISTORICAL BACKFILL V1"
      );

    const nextAuthority =
      sql.indexOf(
        "CING COMMERCE — ORDER LOYALTY POINT EFFECT AUTHORITY V1",
        marker
      );

    assert.ok(
      marker >= 0
    );

    assert.ok(
      nextAuthority > marker
    );

    const region =
      sql.slice(
        marker,
        nextAuthority
      );

    assert.match(
      region,
      /insert into[\s\S]*public\.game_play_transactions/i
    );

    assert.doesNotMatch(
      region,
      /\bupdate\s+public\.players\b/i
    );

    assert.doesNotMatch(
      region,
      /\binsert\s+into\s+public\.analytics_events\b/i
    );
  }
);


test(
  "historical balances are reconstructed from compatibility event arithmetic",
  () => {
    assert.match(
      sql,
      /\(ae\.event_data ->> 'new_total'\)::integer[\s\S]*-[\s\S]*\(ae\.event_data ->> 'amount'\)::integer/i
    );

    assert.match(
      sql,
      /balance_after[\s\S]*balance_before \+ amount/i
    );
  }
);


test(
  "backfill uses canonical order id as future replay reference",
  () => {
    assert.match(
      sql,
      /'order_spending'[\s\S]*o\.id::text/i
    );
  }
);


test(
  "backfill preserves original event time and audit source",
  () => {
    assert.match(
      sql,
      /'historical_backfill',[\s\S]*true/i
    );

    assert.match(
      sql,
      /'historical_analytics_event_id',[\s\S]*ae\.id/i
    );

    assert.match(
      sql,
      /ae\.created_at/i
    );
  }
);


test(
  "migration still has one BEGIN and one final COMMIT",
  () => {
    const begins =
      sql.match(
        /^\s*begin;\s*$/gim
      ) || [];

    const commits =
      sql.match(
        /^\s*commit;\s*$/gim
      ) || [];

    assert.equal(
      begins.length,
      1
    );

    assert.equal(
      commits.length,
      1
    );

    assert.equal(
      sql
        .trim()
        .slice(-7)
        .toLowerCase(),
      "commit;"
    );
  }
);

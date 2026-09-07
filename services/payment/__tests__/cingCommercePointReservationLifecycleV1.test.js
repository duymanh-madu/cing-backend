"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  "db/migrations/20260907_commerce_point_reservation_lifecycle_v1.sql";

const sql =
  fs.readFileSync(
    path,
    "utf8"
  );

test(
  "release authority accepts payment identity and optional reason only",
  () => {
    const match =
      sql.match(
        /cing_commerce_release_payment_points_v1\s*\(([\s\S]*?)\)\s*returns/i
      );

    assert.ok(match);

    assert.match(
      match[1],
      /p_payment_transaction_id bigint/i
    );

    assert.match(
      match[1],
      /p_release_reason text/i
    );

    assert.doesNotMatch(
      match[1],
      /user_id|points|amount/i
    );
  }
);

test(
  "release locks payment reservation and player",
  () => {
    assert.match(
      sql,
      /from public\.payment_transactions[\s\S]*for update[\s\S]*from public\.commerce_point_reservations[\s\S]*for update[\s\S]*from public\.players[\s\S]*for update/i
    );
  }
);

test(
  "release refuses paid or already settled payment",
  () => {
    assert.match(
      sql,
      /payment_status\s*=\s*'paid'[\s\S]*settlement_verified_at[\s\S]*settlement_consumed_at[\s\S]*order_created/i
    );
  }
);

test(
  "release requires failed or actually expired payment",
  () => {
    assert.match(
      sql,
      /payment_status\s*=\s*'failed'[\s\S]*payment_status\s*=\s*'pending'[\s\S]*expired_at[\s\S]*v_now/i
    );
  }
);

test(
  "release restores current balance exactly once",
  () => {
    assert.match(
      sql,
      /v_after\s*:=\s*v_before\s*\+\s*v_reservation\.points/i
    );

    assert.match(
      sql,
      /status\s*=\s*'released'/i
    );

    assert.match(
      sql,
      /where r\.payment_transaction_id[\s\S]*and r\.status\s*=\s*'reserved'/i
    );
  }
);

test(
  "release never creates permanent point transaction",
  () => {
    const start =
      sql.indexOf(
        "public.cing_commerce_release_payment_points_v1"
      );

    const end =
      sql.indexOf(
        "RESERVATION-AWARE PAID ORDER POINT DEDUCT",
        start
      );

    const region =
      sql.slice(
        start,
        end
      );

    assert.doesNotMatch(
      region,
      /insert into\s+(public\.)?point_transactions/i
    );
  }
);

test(
  "paid-order point authority remains same public RPC contract",
  () => {
    assert.match(
      sql,
      /public\.cing_commerce_apply_order_points_deduct_v1\s*\(\s*p_order_id bigint\s*\)/i
    );
  }
);

test(
  "reservation path never deducts player balance twice",
  () => {
    const start =
      sql.indexOf(
        "NEW RESERVATION PATH"
      );

    const end =
      sql.indexOf(
        "LEGACY NON-RESERVATION PATH",
        start
      );

    const region =
      sql.slice(
        start,
        end
      );

    assert.doesNotMatch(
      region,
      /update public\.players/i
    );

    assert.match(
      region,
      /v_before\s*:=\s*v_reservation\.balance_before/i
    );

    assert.match(
      region,
      /v_after\s*:=\s*v_reservation\.balance_after/i
    );
  }
);

test(
  "reservation consume writes one permanent deduct ledger",
  () => {
    assert.match(
      sql,
      /funding_source'[\s\S]*'reserved_points'/i
    );

    assert.match(
      sql,
      /insert into public\.point_transactions[\s\S]*'deduct'[\s\S]*-v_points/i
    );

    assert.match(
      sql,
      /status\s*=\s*'consumed'[\s\S]*commerce_order_id\s*=\s*v_order\.id/i
    );
  }
);

test(
  "released reservation can never be consumed",
  () => {
    assert.match(
      sql,
      /v_reservation\.status\s*=\s*'released'[\s\S]*COMMERCE_POINT_DEDUCT_RESERVATION_RELEASED/i
    );
  }
);

test(
  "consumed reservation requires permanent ledger on replay",
  () => {
    assert.match(
      sql,
      /v_reservation\.status\s*=\s*'consumed'[\s\S]*point_transactions[\s\S]*COMMERCE_POINT_DEDUCT_CONSUMED_LEDGER_MISSING/i
    );
  }
);

test(
  "legacy no-reservation path still serializes and deducts player",
  () => {
    const start =
      sql.indexOf(
        "LEGACY NON-RESERVATION PATH"
      );

    const region =
      sql.slice(start);

    assert.match(
      region,
      /from public\.players[\s\S]*for update/i
    );

    assert.match(
      region,
      /v_after\s*:=\s*v_before\s*-\s*v_points/i
    );

    assert.match(
      region,
      /update public\.players[\s\S]*set total_points/i
    );
  }
);

test(
  "historical non-executed orders remain fenced",
  () => {
    assert.match(
      sql,
      /v_order\.id\s*=\s*139[\s\S]*v_points\s*=\s*5/i
    );

    assert.match(
      sql,
      /v_order\.id\s*=\s*185[\s\S]*v_points\s*=\s*30/i
    );
  }
);

test(
  "both lifecycle authorities remain backend only",
  () => {
    assert.match(
      sql,
      /revoke all[\s\S]*cing_commerce_release_payment_points_v1[\s\S]*from[\s\S]*public[\s\S]*anon[\s\S]*authenticated/i
    );

    assert.match(
      sql,
      /grant execute[\s\S]*cing_commerce_release_payment_points_v1[\s\S]*to service_role/i
    );

    assert.match(
      sql,
      /revoke all[\s\S]*cing_commerce_apply_order_points_deduct_v1\(bigint\)[\s\S]*authenticated/i
    );
  }
);

test(
  "reservation consume path never depends on ambient PLpgSQL FOUND state",
  () => {

    const deductStart =
      sql.indexOf(
        "public.cing_commerce_apply_order_points_deduct_v1("
      );

    assert.ok(
      deductStart >= 0
    );

    const region =
      sql.slice(
        deductStart
      );

    assert.match(
      region,
      /v_has_reservation boolean\s*:=\s*false/i
    );

    assert.match(
      region,
      /select r\.\*[\s\S]*into v_reservation[\s\S]*v_has_reservation\s*:=\s*found/i
    );

    assert.match(
      region,
      /if v_has_reservation then/i
    );

    const newReservationMarker =
      region.indexOf(
        "NEW RESERVATION PATH"
      );

    const legacyMarker =
      region.indexOf(
        "LEGACY NON-RESERVATION PATH"
      );

    assert.ok(
      newReservationMarker >= 0
    );

    assert.ok(
      legacyMarker >
        newReservationMarker
    );

    const reservationRegion =
      region.slice(
        newReservationMarker,
        legacyMarker
      );

    assert.doesNotMatch(
      reservationRegion,
      /\bif\s+found\s+then\b/i
    );

  }
);


test(
  "order without payment transaction remains eligible for explicit legacy path",
  () => {

    const deductStart =
      sql.indexOf(
        "public.cing_commerce_apply_order_points_deduct_v1("
      );

    const region =
      sql.slice(
        deductStart
      );

    const paymentBranch =
      region.indexOf(
        "if v_order.payment_transaction_id"
      );

    const reservationBranch =
      region.indexOf(
        "if v_has_reservation then"
      );

    const legacyBranch =
      region.indexOf(
        "LEGACY NON-RESERVATION PATH"
      );

    assert.ok(
      paymentBranch >= 0
    );

    assert.ok(
      reservationBranch >
        paymentBranch
    );

    assert.ok(
      legacyBranch >
        reservationBranch
    );

  }
);

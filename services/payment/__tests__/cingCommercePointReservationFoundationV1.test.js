"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  "db/migrations/20260907_commerce_point_reservation_foundation_v1.sql";

const sql =
  fs.readFileSync(
    path,
    "utf8"
  );

test(
  "reservation table is keyed by canonical payment transaction",
  () => {
    assert.match(
      sql,
      /commerce_point_reservations[\s\S]*payment_transaction_id bigint[\s\S]*primary key[\s\S]*references public\.payment_transactions\(id\)/i
    );
  }
);

test(
  "reservation owns explicit reserved consumed released lifecycle",
  () => {
    assert.match(
      sql,
      /status in\s*\(\s*'reserved',\s*'consumed',\s*'released'\s*\)/i
    );
  }
);

test(
  "reservation balance invariant is exact",
  () => {
    assert.match(
      sql,
      /balance_after\s*=\s*balance_before\s*-\s*points/i
    );
  }
);

test(
  "reserve RPC accepts payment identity only",
  () => {
    const match =
      sql.match(
        /cing_commerce_reserve_payment_points_v1\s*\(([\s\S]*?)\)\s*returns/i
      );

    assert.ok(match);

    assert.match(
      match[1],
      /p_payment_transaction_id bigint/i
    );

    assert.doesNotMatch(
      match[1],
      /user_id|points|amount/i
    );
  }
);

test(
  "reserve RPC derives user and points from canonical payment",
  () => {
    assert.match(
      sql,
      /from public\.payment_transactions[\s\S]*for update/i
    );

    assert.match(
      sql,
      /v_payment\.user_id/i
    );

    assert.match(
      sql,
      /v_payment\.cart_snapshot[\s\S]*->>\s*'points_used'/i
    );
  }
);

test(
  "existing reservation is replayed before terminal payment checks",
  () => {
    const replay =
      sql.indexOf(
        "Existing reservation is authoritative replay state"
      );

    const pending =
      sql.indexOf(
        "New reservations are allowed only"
      );

    assert.ok(replay >= 0);
    assert.ok(pending > replay);
  }
);

test(
  "player row is locked before point balance mutation",
  () => {
    assert.match(
      sql,
      /from public\.players[\s\S]*for update[\s\S]*update public\.players[\s\S]*set total_points/i
    );
  }
);

test(
  "reservation immediately removes held points from spendable balance",
  () => {
    assert.match(
      sql,
      /v_after\s*:=\s*v_before\s*-\s*v_points/i
    );

    assert.match(
      sql,
      /set total_points\s*=\s*v_after/i
    );
  }
);

test(
  "reservation does not write permanent point_transactions",
  () => {
    const fnStart =
      sql.indexOf(
        "public.cing_commerce_reserve_payment_points_v1"
      );

    const privilegeStart =
      sql.indexOf(
        "PRIVILEGE BOUNDARY",
        fnStart
      );

    const fn =
      sql.slice(
        fnStart,
        privilegeStart
      );

    assert.doesNotMatch(
      fn,
      /insert into\s+(public\.)?point_transactions/i
    );
  }
);

test(
  "client roles cannot execute reservation authority",
  () => {
    for (
      const role
      of [
        "public",
        "anon",
        "authenticated",
      ]
    ) {
      assert.match(
        sql,
        new RegExp(
          `revoke all[\\s\\S]*cing_commerce_reserve_payment_points_v1\\(bigint\\)[\\s\\S]*${role}`,
          "i"
        )
      );
    }

    assert.match(
      sql,
      /grant execute[\s\S]*cing_commerce_reserve_payment_points_v1\(bigint\)[\s\S]*to service_role/i
    );
  }
);

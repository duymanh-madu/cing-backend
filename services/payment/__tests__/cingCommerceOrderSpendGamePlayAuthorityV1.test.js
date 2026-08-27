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
  "commerce order-spend awards reuse authoritative game play ledger",
  () => {
    assert.match(
      sql,
      /insert into[\s\S]*public\.game_play_transactions/i
    );

    assert.doesNotMatch(
      sql,
      /create table[\s\S]*commerce.*play.*ledger/i
    );
  }
);


test(
  "one commerce order can award spend plays at most once",
  () => {
    assert.match(
      sql,
      /create unique index if not exists[\s\S]*game_play_transactions_order_spending_uq[\s\S]*reference_type[\s\S]*reference_id[\s\S]*reference_type = 'order_spending'/i
    );
  }
);


test(
  "order-spend award trusts canonical order and payment authority only",
  () => {
    assert.match(
      sql,
      /cing_commerce_award_order_spend_plays_v1\([\s\S]*p_order_id bigint/i
    );

    assert.match(
      sql,
      /from public\.orders[\s\S]*for update/i
    );

    assert.match(
      sql,
      /payment_transactions[\s\S]*order_created is true[\s\S]*order_id =[\s\S]*payment_status = 'paid'[\s\S]*payment_purpose = 'order'/i
    );
  }
);


test(
  "order spend amount is derived inside PostgreSQL",
  () => {
    assert.match(
      sql,
      /v_order\.subtotal[\s\S]*v_order\.total_amount[\s\S]*v_order\.shipping_fee/i
    );

    assert.match(
      sql,
      /from public\.app_configs[\s\S]*spend_per_play/i
    );
  }
);


test(
  "player balance mutation is serialized",
  () => {
    assert.match(
      sql,
      /from public\.players[\s\S]*where p\.user_id[\s\S]*for update/i
    );

    assert.match(
      sql,
      /set[\s\S]*game_plays[\s\S]*\+ v_plays[\s\S]*plays_from_spend[\s\S]*\+ v_plays/i
    );
  }
);


test(
  "concurrent retry rechecks durable award after player lock",
  () => {
    const fn =
      sql.slice(
        sql.indexOf(
          "public.cing_commerce_award_order_spend_plays_v1("
        )
      );

    const lock =
      fn.indexOf(
        "for update;"
      );

    const firstReplay =
      fn.indexOf(
        "reference_type =\n      'order_spending'"
      );

    const secondReplay =
      fn.indexOf(
        "reference_type =\n      'order_spending'",
        firstReplay + 1
      );

    assert.ok(lock >= 0);
    assert.ok(firstReplay >= 0);
    assert.ok(secondReplay > lock);
  }
);


test(
  "game-play balance and ledger obey exact arithmetic",
  () => {
    assert.match(
      sql,
      /v_after <>[\s\S]*v_before \+ v_plays[\s\S]*COMMERCE_ORDER_SPEND_PLAY_BALANCE_INVARIANT/i
    );

    assert.match(
      sql,
      /transaction_type,[\s\S]*amount,[\s\S]*balance_before,[\s\S]*balance_after/i
    );
  }
);


test(
  "analytics plays_added remains compatibility projection in same authority",
  () => {
    assert.match(
      sql,
      /insert into[\s\S]*public\.analytics_events[\s\S]*'plays_added'[\s\S]*'order_spending'/i
    );
  }
);


test(
  "order-spend authority is backend only",
  () => {
    assert.match(
      sql,
      /revoke all[\s\S]*cing_commerce_award_order_spend_plays_v1[\s\S]*from public,\s*anon,\s*authenticated/i
    );

    assert.match(
      sql,
      /grant execute[\s\S]*cing_commerce_award_order_spend_plays_v1[\s\S]*to service_role/i
    );
  }
);

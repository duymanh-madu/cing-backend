"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const root =
  path.resolve(
    __dirname,
    "../../../.."
  );

const frontend =
  path.resolve(
    root,
    "../cing-game-center-v2-repair-frontend"
  );

const dbSql =
  fs.readFileSync(
    path.join(
      root,
      "db/migrations/20260930_cing_game_gift_message_purchase_activation_v2.sql"
    ),
    "utf8"
  );

const sbSql =
  fs.readFileSync(
    path.join(
      root,
      "supabase/migrations/20260930010000_cing_game_gift_message_purchase_activation_v2.sql"
    ),
    "utf8"
  );

const service =
  fs.readFileSync(
    path.join(
      root,
      "services/games/revival/cingGameGiftPurchaseService.js"
    ),
    "utf8"
  );

const route =
  fs.readFileSync(
    path.join(
      root,
      "routes/cingGameEconomyV2Routes.js"
    ),
    "utf8"
  );

const component =
  fs.readFileSync(
    path.join(
      frontend,
      "src/features/game-center/components/CingGameGiftPurchaseV2.jsx"
    ),
    "utf8"
  );

const authority =
  fs.readFileSync(
    path.join(
      frontend,
      "src/features/game-center/components/cingGameGiftPurchaseV2Authority.js"
    ),
    "utf8"
  );

test(
  "SQL mirrors are byte-identical",
  () => {
    assert.equal(
      dbSql,
      sbSql
    );
  }
);

test(
  "durable sender_message is bounded",
  () => {
    assert.match(
      dbSql,
      /add column if not exists sender_message text/i
    );

    assert.match(
      dbSql,
      /char_length\(sender_message\)\s*<=\s*200/i
    );
  }
);

test(
  "V2 wrapper preserves V1 financial core",
  () => {
    assert.match(
      dbSql,
      /cing_game_gift_purchase_private_v2[\s\S]*?cing_game_gift_purchase_private_v1/i
    );

    assert.match(
      dbSql,
      /GAME_GIFT_REQUEST_CONFLICT/
    );

    assert.match(
      dbSql,
      /sender_message[\s\S]*?is distinct from[\s\S]*?v_message/i
    );
  }
);

test(
  "Gift notification receives the durable message",
  () => {
    assert.match(
      dbSql,
      /Lời nhắn:/
    );

    assert.match(
      dbSql,
      /'senderMessage'/
    );

    assert.match(
      dbSql,
      /GAME_GIFT_NOTIFICATION_BINDING_FAILED/
    );
  }
);

test(
  "only V2 funding wrappers are activated for service_role",
  () => {
    assert.match(
      dbSql,
      /grant execute[\s\S]*?cing_game_gift_purchase_wallet_v2[\s\S]*?to service_role/i
    );

    assert.match(
      dbSql,
      /grant execute[\s\S]*?cing_game_gift_purchase_points_v2[\s\S]*?to service_role/i
    );

    assert.doesNotMatch(
      dbSql,
      /grant execute[\s\S]*?cing_game_gift_purchase_private_v2[\s\S]*?to service_role/i
    );

    assert.match(
      dbSql,
      /CING_GAME_GIFT_V1_MUST_REMAIN_DORMANT/
    );
  }
);

test(
  "application sends and verifies sender_message",
  () => {
    assert.match(
      route,
      /senderMessage:[\s\S]*?req\.body\?\.sender_message/
    );

    assert.match(
      service,
      /cing_game_gift_purchase_wallet_v2/
    );

    assert.match(
      service,
      /cing_game_gift_purchase_points_v2/
    );

    assert.match(
      service,
      /p_sender_message:[\s\S]*?normalizedSenderMessage/
    );

    assert.match(
      authority,
      /normalizeGiftMessage/
    );

    assert.match(
      authority,
      /senderMessage/
    );

    assert.match(
      component,
      /sender_message:[\s\S]*?intent\.senderMessage/
    );
  }
);

test(
  "customer UI uses Điểm quyến rũ wording",
  () => {
    assert.match(
      component,
      /Điểm quyến rũ cho người nhận/
    );

    assert.doesNotMatch(
      component,
      />\s*Charm cho người nhận\s*</
    );
  }
);

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

const route =
  fs.readFileSync(
    path.join(
      root,
      "routes/adminLogRoutes.js"
    ),
    "utf8"
  );

const giftUi =
  fs.readFileSync(
    path.join(
      frontend,
      "src/features/game-center/components/CingGameGiftPurchaseV2.jsx"
    ),
    "utf8"
  );

const adminUi =
  fs.readFileSync(
    path.join(
      frontend,
      "src/features/admin/components/AdminLogs.jsx"
    ),
    "utf8"
  );

test(
  "Activity Logs reads canonical Gift receipts",
  () => {
    assert.match(
      route,
      /\.from\("cing_game_gift_purchases"\)/
    );

    assert.match(
      route,
      /_type:\s*"gift"/
    );

    assert.match(
      route,
      /reference_type:\s*"game_gift_purchase"/
    );

    assert.match(
      route,
      /transaction_code:\s*r\.id/
    );
  }
);

test(
  "Gift operational fields remain searchable",
  () => {
    assert.match(
      route,
      /recipient_user_id\?\.toLowerCase\(\)\.includes\(s\)/
    );

    assert.match(
      route,
      /gift_name\?\.toLowerCase\(\)\.includes\(s\)/
    );

    assert.match(
      route,
      /sender_message\?\.toLowerCase\(\)\.includes\(s\)/
    );
  }
);

test(
  "Admin UI exposes dedicated Gift history",
  () => {
    assert.match(
      adminUi,
      /key:"gift"[\s\S]*label:"Tặng vật phẩm"/
    );

    assert.match(
      adminUi,
      /Mã giao dịch · \{item\.reference_id\}/
    );

    assert.match(
      adminUi,
      /\+\$\{fmt\(item\.charm_awarded\)\} Điểm quyến rũ/
    );
  }
);

test(
  "customer success copy matches product requirement",
  () => {
    assert.match(
      giftUi,
      /✅/
    );

    assert.match(
      giftUi,
      /Đã tặng vật phẩm thành công!/
    );

    assert.doesNotMatch(
      giftUi,
      /Đã tặng Gift thành công!/
    );
  }
);

test(
  "transaction id is hidden from customer Gift popup",
  () => {
    assert.doesNotMatch(
      giftUi,
      /Mã giao dịch/
    );
  }
);

test(
  "customer Gift card uses Điểm quyến rũ",
  () => {
    assert.match(
      giftUi,
      /gift\.charm_award[\s\S]{0,120}Điểm quyến rũ/
    );

    assert.doesNotMatch(
      giftUi,
      /gift\.charm_award[\s\S]{0,120}\}\s*Charm/
    );
  }
);

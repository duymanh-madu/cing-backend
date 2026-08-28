const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const {
  projectCustomerTopupPromotion,
} = require(
  "../cingWalletTopupPromotionReadService"
);

const ROOT =
  path.resolve(
    __dirname,
    "../../.."
  );

const walletRoutes =
  fs.readFileSync(
    path.join(
      ROOT,
      "routes/walletRoutes.js"
    ),
    "utf8"
  );

const serviceSource =
  fs.readFileSync(
    path.join(
      ROOT,
      "services/wallet/cingWalletTopupPromotionReadService.js"
    ),
    "utf8"
  );


test(
  "customer promotion endpoint remains authenticated",
  () => {
    assert.match(
      walletRoutes,
      /router\.get\(\s*["']\/topup\/promotion["'][\s\S]*?authMiddleware/
    );
  }
);


test(
  "customer promotion read uses bounded backend RPC only",
  () => {
    assert.match(
      serviceSource,
      /cing_wallet_get_topup_promotion_v1/
    );

    assert.doesNotMatch(
      serviceSource,
      /\.from\s*\(/
    );

    assert.doesNotMatch(
      serviceSource,
      /cing_wallet_admin_configure_topup_promotion_v1/
    );

    assert.doesNotMatch(
      serviceSource,
      /cing_wallet_apply_mutation_private/
    );

    assert.doesNotMatch(
      serviceSource,
      /cing_wallet_settle_verified_topup_atomic/
    );
  }
);


test(
  "disabled campaign is hidden from customer",
  () => {
    assert.deepEqual(
      projectCustomerTopupPromotion(
        {
          enabled: false,
          name: "Secret",
          starts_at: null,
          ends_at: null,
          tiers: [
            {
              min_topup_amount:
                1000000,
              bonus_amount:
                200000,
            },
          ],
        },
        new Date(
          "2026-08-28T00:00:00.000Z"
        )
      ),
      {
        active: false,
        name: null,
        starts_at: null,
        ends_at: null,
        tiers: [],
      }
    );
  }
);


test(
  "future campaign is hidden from customer",
  () => {
    const result =
      projectCustomerTopupPromotion(
        {
          enabled: true,
          name: "Future",
          starts_at:
            "2026-09-01T00:00:00.000Z",
          ends_at:
            "2026-09-10T00:00:00.000Z",
          tiers: [
            {
              min_topup_amount:
                1000000,
              bonus_amount:
                200000,
            },
          ],
        },
        new Date(
          "2026-08-28T00:00:00.000Z"
        )
      );

    assert.equal(
      result.active,
      false
    );

    assert.deepEqual(
      result.tiers,
      []
    );
  }
);


test(
  "expired campaign is hidden from customer",
  () => {
    const result =
      projectCustomerTopupPromotion(
        {
          enabled: true,
          name: "Expired",
          starts_at:
            "2026-08-01T00:00:00.000Z",
          ends_at:
            "2026-08-20T00:00:00.000Z",
          tiers: [
            {
              min_topup_amount:
                1000000,
              bonus_amount:
                200000,
            },
          ],
        },
        new Date(
          "2026-08-28T00:00:00.000Z"
        )
      );

    assert.equal(
      result.active,
      false
    );
  }
);


test(
  "active campaign exposes only customer-safe projection",
  () => {
    const result =
      projectCustomerTopupPromotion(
        {
          enabled: true,
          name:
            "Nạp Wallet nhận thêm",
          starts_at:
            "2026-08-01T00:00:00.000Z",
          ends_at:
            "2026-09-01T00:00:00.000Z",
          updated_by:
            "super-admin-secret-id",
          updated_at:
            "2026-08-15T00:00:00.000Z",
          tiers: [
            {
              min_topup_amount:
                "2000000",
              bonus_amount:
                "500000",
            },
            {
              min_topup_amount:
                "1000000",
              bonus_amount:
                "200000",
            },
          ],
        },
        new Date(
          "2026-08-28T00:00:00.000Z"
        )
      );

    assert.deepEqual(
      result,
      {
        active: true,
        name:
          "Nạp Wallet nhận thêm",
        starts_at:
          "2026-08-01T00:00:00.000Z",
        ends_at:
          "2026-09-01T00:00:00.000Z",
        tiers: [
          {
            min_topup_amount:
              1000000,
            bonus_amount:
              200000,
          },
          {
            min_topup_amount:
              2000000,
            bonus_amount:
              500000,
          },
        ],
      }
    );

    assert.equal(
      Object.hasOwn(
        result,
        "updated_by"
      ),
      false
    );

    assert.equal(
      Object.hasOwn(
        result,
        "updated_at"
      ),
      false
    );

    assert.equal(
      Object.hasOwn(
        result,
        "enabled"
      ),
      false
    );
  }
);


test(
  "promotion start is inclusive and end is exclusive",
  () => {
    const campaign = {
      enabled: true,
      name: "Window",
      starts_at:
        "2026-08-28T00:00:00.000Z",
      ends_at:
        "2026-08-29T00:00:00.000Z",
      tiers: [
        {
          min_topup_amount:
            100000,
          bonus_amount:
            10000,
        },
      ],
    };

    assert.equal(
      projectCustomerTopupPromotion(
        campaign,
        new Date(
          "2026-08-28T00:00:00.000Z"
        )
      ).active,
      true
    );

    assert.equal(
      projectCustomerTopupPromotion(
        campaign,
        new Date(
          "2026-08-29T00:00:00.000Z"
        )
      ).active,
      false
    );
  }
);


test(
  "enabled campaign without tiers fails closed",
  () => {
    assert.deepEqual(
      projectCustomerTopupPromotion(
        {
          enabled: true,
          name: "Invalid",
          starts_at: null,
          ends_at: null,
          tiers: [],
        }
      ),
      {
        active: false,
        name: null,
        starts_at: null,
        ends_at: null,
        tiers: [],
      }
    );
  }
);

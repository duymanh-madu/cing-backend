const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  isLeaderboardSelfRequest,
} = require(
  "../../../utils/leaderboardSelfRankAuthority"
);

/*
 * Isolated unit-test boundary:
 * leaderboardBadgeProjectionService imports the shared Supabase module
 * for runtime enrichment. These unit cases exercise only pure badge
 * projection, therefore stub Supabase before requiring that service.
 *
 * No credential / network / Production DB access.
 */
const supabaseModulePath =
  require.resolve(
    "../../../supabase"
  );

require.cache[
  supabaseModulePath
] = {
  id:supabaseModulePath,
  filename:supabaseModulePath,
  loaded:true,
  exports:{},
  children:[],
  paths:[],
};

const {
  buildOwnedBadges,
  enrichLeaderboardRowsWithBadges,
} = require(
  "../../leaderboardBadgeProjectionService"
);

test(
  "self rank accepts authenticated customer phone only",
  () => {
    const req = {
      customer:{
        id:"customer-1",
        phone:"84912345678",
      },
    };

    assert.equal(
      isLeaderboardSelfRequest(
        req,
        "0912345678"
      ),
      true
    );

    assert.equal(
      isLeaderboardSelfRequest(
        req,
        "customer-1"
      ),
      true
    );

    assert.equal(
      isLeaderboardSelfRequest(
        req,
        "0988888888"
      ),
      false
    );
  }
);

test(
  "self rank fails closed without authenticated customer",
  () => {
    assert.equal(
      isLeaderboardSelfRequest(
        {},
        "0912345678"
      ),
      false
    );
  }
);

test(
  "owned badges preserve tier custom and live titles",
  () => {
    assert.deepEqual(
      buildOwnedBadges({
        crmTier:
          "Hội viên Kim Cương",
        customBadges:[
          "idol",
          "ngoi_sao",
        ],
        champion:true,
        hofRank:"hof_2",
      }),
      [
        "diamond",
        "idol",
        "ngoi_sao",
        "champion",
        "hof_2",
      ]
    );
  }
);

test(
  "owned badges dedupe and reject unknown keys",
  () => {
    assert.deepEqual(
      buildOwnedBadges({
        crmTier:"gold",
        customBadges:[
          "gold",
          "idol",
          "unknown_badge",
          "idol",
        ],
      }),
      [
        "gold",
        "idol",
      ]
    );
  }
);

test(
  "badge enrichment fails open when metadata source is unavailable",
  async () => {
    const rows = [
      {
        user_id:"0912345678",
        player_name:"Cing iu",
        crm_tier:"gold",
        custom_badges:[
          "idol",
        ],
        score:100,
      },
    ];

    const result =
      await enrichLeaderboardRowsWithBadges(
        rows
      );

    assert.equal(
      result.length,
      1
    );

    assert.equal(
      result[0].score,
      100
    );

    assert.deepEqual(
      result[0].owned_badges,
      [
        "gold",
        "idol",
      ]
    );
  }
);

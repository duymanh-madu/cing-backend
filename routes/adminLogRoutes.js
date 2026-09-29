const express  = require("express");
const router   = express.Router();
const jwt      = require("jsonwebtoken");
const supabase = require("../supabase");
const {
  JWT_SECRET,
} = require(
  "../utils/jwtSecretAuthority"
);

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success:false, message:"Unauthorized" });
  try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ success:false, message:"Token không hợp lệ" }); }
}

router.get("/", requireAdmin, async (req, res) => {
  try {
    const { filter="all", limit=50, page=1, search="" } = req.query;
    const lim = Math.min(Number(limit), 100);
    const off = (Number(page)-1) * lim;
    const fetchWindow =
      Math.max(
        1,
        off + lim + 1
      );
    const needAll     = filter === "all";

    /*
     * Canonical Revive Credit audit path.
     *
     * This branch owns its pagination/search at the durable
     * ledger instead of querying the newest N rows and then
     * slicing/filtering them in memory.
     *
     * Search deliberately issues one bounded query per
     * searchable ledger column. This avoids raw PostgREST
     * OR-expression construction from Admin input while
     * still searching the full ledger correctly.
     */
    if (filter === "revive_credit") {
      const safePage =
        Number.isSafeInteger(Number(page)) &&
        Number(page) > 0
          ? Number(page)
          : 1;

      const safeLimit =
        Number.isSafeInteger(Number(limit)) &&
        Number(limit) > 0
          ? Math.min(Number(limit), 100)
          : 50;

      const reviveOff =
        (safePage - 1) *
        safeLimit;

      const selectFields =
        [
          "id",
          "user_id",
          "transaction_type",
          "amount",
          "balance_before",
          "balance_after",
          "reason",
          "game_key",
          "session_id",
          "reference_type",
          "reference_id",
          "metadata",
          "created_at",
        ].join(",");

      const mapReviveRow =
        (r) => ({
          ...r,
          _type:
            "revive_credit",
          amount:
            Number(r.amount || 0),
          balance_before:
            Number(
              r.balance_before || 0
            ),
          balance_after:
            Number(
              r.balance_after || 0
            ),
          source:
            r.reference_type || "",
          created_at:
            r.created_at,
        });

      const normalizedSearch =
        String(search || "")
          .trim();

      let rows = [];

      if (!normalizedSearch) {
        const result =
          await supabase
            .from(
              "cing_revive_credit_transactions"
            )
            .select(
              selectFields
            )
            .order(
              "created_at",
              {
                ascending:
                  false,
              }
            )
            .order(
              "id",
              {
                ascending:
                  false,
              }
            )
            .range(
              reviveOff,
              reviveOff +
                safeLimit
            );

        if (result.error) {
          const error =
            new Error(
              "Không thể đọc nhật ký Revive Credit"
            );

          error.code =
            "REVIVE_CREDIT_LOG_READ_FAILED";

          error.cause =
            result.error;

          throw error;
        }

        rows =
          result.data || [];
      } else {
        const searchableFields =
          [
            "user_id",
            "reference_type",
            "reference_id",
            "reason",
            "game_key",
          ];

        /*
         * For union pagination, top K rows from every
         * searchable column are sufficient to derive the
         * top K rows of their union.
         */
        const windowSize =
          reviveOff +
          safeLimit +
          1;

        const results =
          await Promise.all(
            searchableFields.map(
              (field) =>
                supabase
                  .from(
                    "cing_revive_credit_transactions"
                  )
                  .select(
                    selectFields
                  )
                  .ilike(
                    field,
                    `%${normalizedSearch}%`
                  )
                  .order(
                    "created_at",
                    {
                      ascending:
                        false,
                    }
                  )
                  .order(
                    "id",
                    {
                      ascending:
                        false,
                    }
                  )
                  .limit(
                    windowSize
                  )
            )
          );

        const failed =
          results.find(
            (result) =>
              result.error
          );

        if (failed) {
          const error =
            new Error(
              "Không thể tìm kiếm nhật ký Revive Credit"
            );

          error.code =
            "REVIVE_CREDIT_LOG_SEARCH_FAILED";

          error.cause =
            failed.error;

          throw error;
        }

        const byId =
          new Map();

        for (
          const result of
            results
        ) {
          for (
            const row of
              result.data || []
          ) {
            byId.set(
              String(row.id),
              row
            );
          }
        }

        rows =
          [...byId.values()]
            .sort(
              (a, b) => {
                const timeDiff =
                  new Date(
                    b.created_at ||
                      0
                  ) -
                  new Date(
                    a.created_at ||
                      0
                  );

                if (timeDiff) {
                  return timeDiff;
                }

                return String(
                  b.id || ""
                ).localeCompare(
                  String(
                    a.id || ""
                  )
                );
              }
            )
            .slice(
              reviveOff,
              reviveOff +
                safeLimit +
                1
            );
      }

      const hasMore =
        rows.length >
        safeLimit;

      const data =
        rows
          .slice(
            0,
            safeLimit
          )
          .map(
            mapReviveRow
          );

      return res.json({
        success:
          true,

        data,

        page:
          safePage,

        limit:
          safeLimit,

        has_more:
          hasMore,
      });
    }

    // Helper search filter
    const addSearch = (q, cols) => {
      if (!search) return q;
      // Supabase không hỗ trợ OR trên nhiều columns dễ dàng
      // Dùng ilike trên column đầu tiên
      return q.ilike(cols[0], `%${search}%`);
    };

    const [
      games,
      points,
      reviveCredits,
      playsBought,
      playsGiven,
      rewards,
      profileChanges,
    ] = await Promise.all([
      // Game scores
      (needAll || filter==="games")
        ? supabase.from("game_scores")
            .select("id,user_id,player_name,game_key,score,kills,played_at")
            .order("played_at",{ascending:false}).limit(fetchWindow)
        : {data:[]},

      // Points history - từ analytics_events
      (needAll || filter==="points")
        ? supabase.from("analytics_events")
            .select("id,event_name,user_id,event_data,created_at")
            .in("event_name",["points_added","points_deducted","points_earned"])
            .order("created_at",{ascending:false}).limit(fetchWindow)
        : {data:[]},

      /*
       * Active Game Center V2 resource audit.
       *
       * Canonical authority is the durable Revive Credit
       * ledger, never analytics_events.
       */
      (needAll || filter==="revive_credit")
        ? supabase
            .from("cing_revive_credit_transactions")
            .select(
              [
                "id",
                "user_id",
                "transaction_type",
                "amount",
                "balance_before",
                "balance_after",
                "reason",
                "game_key",
                "session_id",
                "reference_type",
                "reference_id",
                "metadata",
                "created_at",
              ].join(",")
            )
            .order("created_at",{ascending:false})
            .order("id",{ascending:false})
            .limit(fetchWindow)
        : {data:[]},

      /*
       * Historical V1 audit only.
       *
       * These rows remain visible under "all" for audit
       * continuity, but there is no longer an active
       * Admin Logs filter for the legacy game-play asset.
       */
      needAll
        ? supabase.from("analytics_events")
            .select("id,event_name,user_id,event_data,created_at")
            .eq("event_name","plays_purchased")
            .order("created_at",{ascending:false}).limit(fetchWindow)
        : {data:[]},

      needAll
        ? supabase.from("analytics_events")
            .select("id,event_name,user_id,event_data,created_at")
            .in("event_name",["plays_added","plays_adjusted"])
            .order("created_at",{ascending:false}).limit(fetchWindow)
        : {data:[]},

      // Rewards claimed
      (needAll || filter==="rewards")
        ? supabase.from("pending_rewards")
            .select("id,user_id,player_name,points,reason,rank,board,claimed,claimed_at,created_at")
            .order("created_at",{ascending:false}).limit(fetchWindow)
        : {data:[]},

      // Profile changes
      (needAll || filter==="profile_changes")
        ? supabase.from("analytics_events")
            .select("id,event_name,user_id,event_data,created_at")
            .eq("event_name","profile_updated")
            .order("created_at",{ascending:false}).limit(fetchWindow)
        : {data:[]},
    ]);

    const queryErrors = [
      ["games", games],
      ["points", points],
      ["revive_credit", reviveCredits],
      ["legacy_plays_bought", playsBought],
      ["legacy_plays_given", playsGiven],
      ["rewards", rewards],
      ["profile_changes", profileChanges],
    ].filter(
      ([, result]) =>
        result?.error
    );

    if (queryErrors.length > 0) {
      const [
        source,
        result,
      ] =
        queryErrors[0];

      const error =
        new Error(
          `Không thể đọc Admin Logs (${source})`
        );

      error.code =
        "ADMIN_LOG_READ_FAILED";

      error.cause =
        result.error;

      throw error;
    }

    // Map data với _type
    const mapAnalytics = (rows, type) => (rows||[]).map(r => ({
      ...r,
      _type: type,
      amount:    r.event_data?.amount ?? r.event_data?.plays ?? 0,
      reason:    r.event_data?.reason || "",
      field:     r.event_data?.field || "",
      points_used: r.event_data?.points_used || 0,
      new_total: r.event_data?.new_total,
      admin:     r.event_data?.admin || "",
      // Historical V1 origin only.
      source:    r.event_name === "plays_adjusted" ? "admin" : "auto",
      created_at: r.created_at,
    }));

    const mapReviveCredits =
      (rows || []).map((r) => ({
        ...r,
        _type: "revive_credit",
        amount: Number(r.amount || 0),
        balance_before:
          Number(r.balance_before || 0),
        balance_after:
          Number(r.balance_after || 0),
        source:
          r.reference_type || "",
        created_at: r.created_at,
      }));

    const mergedLogs = [
      ...(games.data||[]).map(g=>({...g,_type:"game",created_at:g.played_at})),
      ...mapAnalytics(points.data, "points"),
      ...mapReviveCredits(reviveCredits.data),
      ...mapAnalytics(
        playsBought.data,
        "legacy_plays_bought"
      ),
      ...mapAnalytics(
        playsGiven.data,
        "legacy_plays_given"
      ),
      ...mapAnalytics(profileChanges.data, "profile_change"),
      ...(rewards.data||[]).map(r=>({...r, _type:"reward", created_at:r.claimed_at||r.created_at})),
    ]
    .filter(log => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        log.customer_name?.toLowerCase().includes(s) ||
        log.player_name?.toLowerCase().includes(s) ||
        log.user_id?.toLowerCase().includes(s) ||
        log.order_code?.toLowerCase().includes(s) ||
        log.transaction_code?.toLowerCase().includes(s) ||
        log.reference_type?.toLowerCase().includes(s) ||
        log.reference_id?.toLowerCase().includes(s) ||
        log.reason?.toLowerCase().includes(s) ||
        log.game_key?.toLowerCase().includes(s)
      );
    })
    .sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0));

    const allLogs =
      mergedLogs.slice(
        off,
        off + lim
      );

    const hasMore =
      mergedLogs.length >
      off + lim;

    res.json({
      success:true,
      data:allLogs,
      page:Number(page),
      limit:lim,
      has_more:hasMore,
    });
  } catch(err) {
    res.status(500).json({ success:false, error:err.message });
  }
});

module.exports = router;

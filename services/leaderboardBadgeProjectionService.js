const supabase =
  require("../supabase");

const CANONICAL_BADGES =
  new Set([
    "member",
    "loyal",
    "silver",
    "gold",
    "diamond",
    "partner",
    "loyal_partner",
    "champion",
    "hof_1",
    "hof_2",
    "hof_3",
    "idol",
    "ngoi_sao",
    "minh_tinh",
  ]);

let liveCache = {
  expiresAt:0,
  champion:"",
  hof:new Map(),
};

function normalizeIdentity(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .replace(/^84/, "0");
}

function parseBadgeList(value) {
  if (Array.isArray(value)) {
    return value
      .map(v => String(v || "").trim())
      .filter(Boolean);
  }

  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed =
        JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed
          .map(v =>
            String(v || "").trim()
          )
          .filter(Boolean);
      }
    } catch {}

    return value
      .split(",")
      .map(v => v.trim())
      .filter(Boolean);
  }

  return [];
}

function mapTierKey(raw) {
  const r =
    String(raw || "")
      .toLowerCase()
      .trim();

  if (!r) return "member";

  if (
    r === "diamond" ||
    r.includes("diamond") ||
    (
      r.includes("kim") &&
      (
        r.includes("cuong") ||
        r.includes("cương")
      )
    )
  ) {
    return "diamond";
  }

  if (
    r.includes("vang") ||
    r.includes("vàng") ||
    r.includes("gold")
  ) {
    return "gold";
  }

  if (
    r.includes("bac") ||
    r.includes("bạc") ||
    r.includes("silver")
  ) {
    return "silver";
  }

  const partner =
    r.includes("doi tac") ||
    r.includes("đối tác") ||
    r.includes("partner");

  const loyal =
    r.includes("than thiet") ||
    r.includes("thân thiết") ||
    r.includes("loyal");

  if (partner && loyal) {
    return "loyal_partner";
  }

  if (partner) {
    return "partner";
  }

  if (loyal) {
    return "loyal";
  }

  return "member";
}

function buildOwnedBadges({
  crmTier,
  customBadges,
  champion = false,
  hofRank = null,
}) {
  const raw = [
    mapTierKey(crmTier),
    ...parseBadgeList(
      customBadges
    ),
    ...(champion
      ? ["champion"]
      : []),
    ...(hofRank
      ? [hofRank]
      : []),
  ];

  return raw
    .filter(
      key =>
        CANONICAL_BADGES.has(
          key
        )
    )
    .filter(
      (key, index, arr) =>
        arr.indexOf(key) ===
        index
    );
}

async function getLiveBadgeAuthority() {
  const now = Date.now();

  if (
    liveCache.expiresAt >
      now
  ) {
    return liveCache;
  }

  const [
    spendingResult,
    chessResult,
  ] = await Promise.all([
    supabase
      .from("players")
      .select(
        "user_id,crm_spend_alltime"
      )
      .gt(
        "crm_spend_alltime",
        0
      )
      .order(
        "crm_spend_alltime",
        { ascending:false }
      )
      .limit(3),

    supabase
      .from("chess_stats")
      .select(
        "user_id,wins,total_games"
      )
      .gt("wins", 0)
      .order(
        "wins",
        { ascending:false }
      )
      .order(
        "total_games",
        { ascending:false }
      )
      .limit(1),
  ]);

  if (
    spendingResult.error
  ) {
    throw spendingResult.error;
  }

  if (chessResult.error) {
    throw chessResult.error;
  }

  const hof =
    new Map();

  (
    spendingResult.data ||
    []
  ).forEach(
    (row, index) => {
      const id =
        normalizeIdentity(
          row.user_id
        );

      if (id) {
        hof.set(
          id,
          `hof_${index + 1}`
        );
      }
    }
  );

  const champion =
    normalizeIdentity(
      chessResult
        .data?.[0]
        ?.user_id
    );

  liveCache = {
    expiresAt:
      now + 5000,
    champion,
    hof,
  };

  return liveCache;
}

async function enrichLeaderboardRowsWithBadgesUnsafe(
  rows
) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  if (
    safeRows.length === 0
  ) {
    return [];
  }

  const identities = [
    ...new Set(
      safeRows
        .map(row =>
          normalizeIdentity(
            row?.user_id
          )
        )
        .filter(Boolean)
    ),
  ];

  let players = [];

  if (
    identities.length > 0
  ) {
    const result =
      await supabase
        .from("players")
        .select(
          "user_id,crm_tier,custom_badges"
        )
        .in(
          "user_id",
          identities.slice(
            0,
            100
          )
        );

    if (result.error) {
      throw result.error;
    }

    players =
      result.data || [];
  }

  const playerMap =
    new Map(
      players.map(
        player => [
          normalizeIdentity(
            player.user_id
          ),
          player,
        ]
      )
    );

  const live =
    await getLiveBadgeAuthority();

  return safeRows.map(
    row => {
      const identity =
        normalizeIdentity(
          row?.user_id
        );

      const player =
        playerMap.get(
          identity
        ) || {};

      const crmTier =
        row?.crm_tier ||
        player.crm_tier ||
        "";

      const customBadges =
        row?.custom_badges ??
        player.custom_badges ??
        [];

      const hofRank =
        live.hof.get(
          identity
        ) || null;

      const champion =
        Boolean(
          identity &&
          live.champion &&
          identity ===
            live.champion
        );

      return {
        ...row,
        crm_tier:crmTier,
        custom_badges:
          parseBadgeList(
            customBadges
          ),
        owned_badges:
          buildOwnedBadges({
            crmTier,
            customBadges,
            champion,
            hofRank,
          }),
      };
    }
  );
}

async function enrichLeaderboardRowsWithBadges(
  rows
) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  try {
    return await enrichLeaderboardRowsWithBadgesUnsafe(
      safeRows
    );
  } catch (error) {
    console.warn(
      "[LEADERBOARD BADGES] enrichment failed open:",
      error?.message || error
    );

    return safeRows.map(
      row => ({
        ...row,
        owned_badges:
          buildOwnedBadges({
            crmTier:
              row?.crm_tier || "",
            customBadges:
              row?.custom_badges || [],
          }),
      })
    );
  }
}

module.exports = {
  buildOwnedBadges,
  enrichLeaderboardRowsWithBadges,
};

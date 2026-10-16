const supabase = require("../supabase");
const { realtimeEventBus } = require("./realtime/realtimeEventBus");
const { broadcastNotification } = require("./notificationService");
const REVIVAL_GAMES = new Set(["black-pearl-rush", "cing-stack-tower"]);

function todayVN() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

async function readAdminChallenges() {
  const { data, error } = await supabase.from("app_configs")
    .select("daily_challenge_config").eq("id", 1).single();
  if (error) throw error;
  const entries = data?.daily_challenge_config?.challenges;
  if (!Array.isArray(entries)) throw new Error("DAILY_CHALLENGE_CONFIG_INVALID");
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
        typeof entry.game_key !== "string" || !entry.game_key.trim() ||
        typeof entry.enabled !== "boolean" || seen.has(entry.game_key)) {
      throw new Error("DAILY_CHALLENGE_CONFIG_INVALID");
    }
    seen.add(entry.game_key);
    if (entry.enabled && (
      !["combo", "score", "wins"].includes(entry.challenge_type) ||
      !Number.isInteger(entry.target_value) || entry.target_value < 1 ||
      entry.target_value > 1000000 ||
      !Number.isInteger(entry.reward_points) || entry.reward_points < 1 ||
      entry.reward_points > 1000000
    )) throw new Error("DAILY_CHALLENGE_CONFIG_INVALID");
  }
  return entries;
}

async function getTodayChallenge(game_key = "black-pearl-rush") {
  // Revival creation and reward remain exclusively snapshot-bound.
  if (REVIVAL_GAMES.has(game_key)) {
    const entries = await readAdminChallenges();
    if (!entries.some(c => c.game_key === game_key && c.enabled === true)) return null;
    const { data, error } = await supabase.from("daily_challenges")
      .select("*").eq("challenge_date", todayVN()).eq("game_key", game_key).maybeSingle();
    if (error) throw error;
    return data || null;
  }
  // PostgreSQL reads/locks Admin config before any creation or update.
  // Missing migration / read error must never fall back to local defaults.
  const { data, error } = await supabase.rpc("cing_daily_challenge_resolve_admin_v1", {
    p_game_key: game_key,
  });
  if (error) throw error;
  return data || null;
}

async function getTodayChallenges() {
  const entries = await readAdminChallenges();
  const results = [];
  for (const entry of entries.filter(c => c.enabled === true)) {
    const row = await getTodayChallenge(entry.game_key);
    if (row) results.push(row);
  }
  return results;
}

async function syncTodayChallengesFromConfig() {
  const entries = await readAdminChallenges();
  const results = [];
  for (const entry of entries.filter(c => c.enabled === true && !REVIVAL_GAMES.has(c.game_key))) {
    const row = await getTodayChallenge(entry.game_key);
    if (row) results.push(row);
  }
  // Disabled rows are retained for audit; resolver/claim refuse them.
  // Do not delete history or reset a previously completed challenge.
  return results;
}

// Kiem tra combo va claim reward
async function claimChallengeReward({ user_id, player_name, avatar, combo, score, progress, game_key = "black-pearl-rush" }) {
  if (REVIVAL_GAMES.has(game_key)) {
    return { success: false, code: "REVIVAL_CHALLENGE_V2_AUTHORITY_REQUIRED",
      message: "Phần thưởng game được xử lý qua Revival V2" };
  }
  const challenge = await getTodayChallenge(game_key);
  
  if (!challenge) return { success: false, message: "Không tìm thấy thử thách" };
  if (challenge.completed) return { success: false, message: "Thử thách đã có người nhận thưởng", winner: challenge.winner_name };
  const progressValue = Number(
    challenge.challenge_type === "combo"
      ? combo
      : (score ?? progress ?? combo)
  );

  const unitLabel = challenge.challenge_type === "wins" ? "ván thắng" : "combo";
  if (!Number.isFinite(progressValue) || progressValue < Number(challenge.target_value || 0)) {
    return { success: false, message: `Cần đạt ${challenge.target_value} ${unitLabel}` };
  }

  /*
   * PostgreSQL owns exactly-once financial authority:
   *
   * winner
   * + completed
   * + players.total_points
   * + point_transactions
   *
   * Notification logic below remains unchanged.
   */
  const { data: atomicRows, error: atomicError } =
    await supabase.rpc(
      "complete_daily_challenge_atomic",
      {
        p_challenge_id: challenge.id,
        p_user_id: String(user_id),
        p_player_name: player_name || null,
        p_player_avatar: avatar || null,
        p_progress: progressValue,
      }
    );

  if (atomicError) {
    console.warn(
      "[CHALLENGE] Atomic reward failed:",
      atomicError.message
    );

    return {
      success: false,
      message: "Không thể nhận thưởng thử thách",
    };
  }

  const atomicResult =
    Array.isArray(atomicRows)
      ? atomicRows[0]
      : atomicRows;

  if (!atomicResult?.applied) {
    return {
      success: false,
      message: "Thử thách đã có người nhận thưởng",
      winner: atomicResult?.winner_name || null,
    };
  }

  // Broadcast toan server
  const msg = `🏆 ${player_name} vừa hoàn thành thử thách ngày và nhận +${atomicResult.reward_points} điểm tích lũy!`;
  
  realtimeEventBus.publish({
    event: "challenge.won",
    delivery_type: "BROADCAST",
    payload: {
      winner_user_id: user_id,
      winner_name:    player_name,
      winner_avatar:  avatar,
      reward_points:  atomicResult.reward_points,
      message: msg,
      game_key,
    },
    channel: "challenge",
    timestamp: new Date().toISOString(),
  });

  // Popup riêng cho người nhận thưởng.
  // Frontend có thể delay hiển thị nếu user đang ở trong game, rồi show khi thoát game.
  realtimeEventBus.publish({
    event: "notification.broadcast",
    delivery_type: "ROOM",
    room: `member:${user_id}`,
    payload: {
      notification: {
        title: "🏆 Nhận thưởng thử thách ngày!",
        message: `Chúc mừng! Bạn nhận được +${atomicResult.reward_points} điểm tích lũy.`,
        type: "daily_challenge_reward",
        created_at: new Date().toISOString(),
        delay_if_in_game: true,
      },
      popup: {
        type: "daily_challenge_reward",
        reward_points: atomicResult.reward_points,
        game_key,
        delay_if_in_game: true,
      },
    },
    channel: "notification",
    timestamp: new Date().toISOString(),
  });

  // Push notification toan server
  await broadcastNotification({
    template_key: "CAMPAIGN_BROADCAST",
    custom: { title: "🏆 Thử thách ngày đã có người nhận thưởng!", message: msg }
  });

  console.log(`[CHALLENGE] Winner: ${player_name} - progress ${progressValue}`);
  return { success: true, reward_points: atomicResult.reward_points, message: `Chúc mừng! Bạn nhận được +${atomicResult.reward_points} điểm!` };
}

module.exports = { getTodayChallenge, getTodayChallenges, claimChallengeReward, syncTodayChallengesFromConfig };

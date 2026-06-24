const supabase = require("../supabase");
const { realtimeEventBus } = require("./realtime/realtimeEventBus");
const { broadcastNotification } = require("./notificationService");
const { addPoints } = require("./loyaltyPointService");

function todayVN() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

// Lay hoac tao challenge ngay hom nay
async function getTodayChallenge(game_key = "black-pearl-rush") {
  const today = todayVN();
  
  const { data: existing } = await supabase
    .from("daily_challenges")
    .select("*")
    .eq("challenge_date", today)
    .eq("game_key", game_key)
    .maybeSingle();

  if (existing) return existing;

  // Đọc config từ DB
  const { data: cfgRow } = await supabase
    .from("app_configs")
    .select("daily_challenge_config")
    .eq("id", 1)
    .single();

  const challenges = cfgRow?.daily_challenge_config?.challenges || [];
  const cfg = challenges.find(c => c.game_key === game_key && c.enabled !== false)
    || { game_key, challenge_type:"combo", target_value:100, reward_points:50, label:"Đạt combo 100 trong game Bay cùng trân châu" };

  // Tao challenge moi cho ngay hom nay
  const { data: created } = await supabase
    .from("daily_challenges")
    .insert({
      challenge_date: today,
      game_key:        cfg.game_key,
      challenge_type:  cfg.challenge_type || "combo",
      target_value:    cfg.target_value   || 100,
      reward_points:   cfg.reward_points  || 50,
      label:           cfg.label          || null,
    })
    .select()
    .single();

  return created;
}

// Lấy tất cả challenges hôm nay cho tất cả game trong config
async function getTodayChallenges() {
  const today = todayVN();
  const { data: cfgRow } = await supabase.from("app_configs")
    .select("daily_challenge_config").eq("id", 1).single();
  const challenges = cfgRow?.daily_challenge_config?.challenges || [];
  const enabled = challenges.filter(c => c.enabled !== false);
  if (enabled.length === 0) return [];

  const results = [];
  for (const cfg of enabled) {
    let challenge = await getTodayChallenge(cfg.game_key);
    if (challenge) results.push(challenge);
  }
  return results;
}

// Kiem tra combo va claim reward
async function claimChallengeReward({ user_id, player_name, avatar, combo, score, progress, game_key = "black-pearl-rush" }) {
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

  // Cap nhat winner
  const { data: updated, error } = await supabase
    .from("daily_challenges")
    .update({
      winner_user_id: user_id,
      winner_name: player_name,
      winner_avatar: avatar,
      completed: true,
      completed_at: new Date().toISOString(),
    })
    .eq("id", challenge.id)
    .eq("completed", false) // Optimistic lock - chi 1 user thang
    .select()
    .single();

  if (error || !updated) return { success: false, message: "Có người vừa nhận thưởng trước bạn!" };

  // Cong diem tich luy cho winner
  try {
    const { awardPlays } = require("./dailyMissionService");
    // Cap nhat diem trong players table
    // Cong diem va sync ve iPOS
    await addPoints({
      phone: user_id,
      user_id,
      points: challenge.reward_points,
      reason: "Phần thưởng thử thách ngày",
    });
  } catch(e) {
    console.warn("[CHALLENGE] Points award failed:", e.message);
  }

  // Broadcast toan server
  const msg = `🏆 ${player_name} vừa hoàn thành thử thách ngày và nhận +${challenge.reward_points} điểm tích lũy!`;
  
  realtimeEventBus.publish({
    event: "challenge.won",
    delivery_type: "BROADCAST",
    payload: {
      winner_user_id: user_id,
      winner_name:    player_name,
      winner_avatar:  avatar,
      reward_points:  challenge.reward_points,
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
        message: `Chúc mừng! Bạn nhận được +${challenge.reward_points} điểm tích lũy.`,
        type: "daily_challenge_reward",
        created_at: new Date().toISOString(),
        delay_if_in_game: true,
      },
      popup: {
        type: "daily_challenge_reward",
        reward_points: challenge.reward_points,
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
  return { success: true, reward_points: challenge.reward_points, message: `Chúc mừng! Bạn nhận được +${challenge.reward_points} điểm!` };
}

module.exports = { getTodayChallenge, getTodayChallenges, claimChallengeReward };

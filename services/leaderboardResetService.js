const supabase = require('../supabase');

function resolvePlayerName(player) {
  return (
    player?.display_name ||
    player?.zalo_name ||
    player?.player_name ||
    player?.user_id ||
    "Cing iu"
  );
}

/**
 * Kiểm tra xem có cần reset không (mỗi thứ 2 00:00 VN)
 * Chạy mỗi phút, tự detect khi đến giờ
 */
function scheduleWeeklyReset(io) {
  setInterval(() => checkAndReset(io), 60 * 1000);
  setInterval(() => checkAndResetMonthly(io), 60 * 1000);
  setInterval(() => checkAndResetYearly(io), 60 * 1000);

  console.log(
    "[RESET] DB-authoritative Weekly/Monthly/Yearly reset schedulers started"
  );
}

function vietnamNow() {
  return new Date(
    new Date().toLocaleString(
      "en-US",
      { timeZone: "Asia/Ho_Chi_Minh" }
    )
  );
}

function toUtcFromVietnamWallClock(date) {
  return new Date(
    date.getTime() -
    7 * 60 * 60 * 1000
  );
}

function monthlyWindow(now = vietnamNow()) {
  const currentStartVN =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0, 0, 0, 0
    );

  const previousStartVN =
    new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
      0, 0, 0, 0
    );

  return {
    periodKey:
      `${previousStartVN.getFullYear()}-` +
      `${String(
        previousStartVN.getMonth() + 1
      ).padStart(2, "0")}`,
    startUtc:
      toUtcFromVietnamWallClock(
        previousStartVN
      ).toISOString(),
    endUtc:
      toUtcFromVietnamWallClock(
        currentStartVN
      ).toISOString(),
  };
}

function yearlyWindow(now = vietnamNow()) {
  const currentStartVN =
    new Date(
      now.getFullYear(),
      0,
      1,
      0, 0, 0, 0
    );

  const previousStartVN =
    new Date(
      now.getFullYear() - 1,
      0,
      1,
      0, 0, 0, 0
    );

  return {
    periodKey:
      String(previousStartVN.getFullYear()),
    startUtc:
      toUtcFromVietnamWallClock(
        previousStartVN
      ).toISOString(),
    endUtc:
      toUtcFromVietnamWallClock(
        currentStartVN
      ).toISOString(),
  };
}

function weeklyWindow(now = vietnamNow()) {
  const daysBack =
    (now.getDay() + 6) % 7;

  const currentMondayVN =
    new Date(now);

  currentMondayVN.setDate(
    now.getDate() - daysBack
  );

  currentMondayVN.setHours(
    0, 0, 0, 0
  );

  const previousMondayVN =
    new Date(currentMondayVN);

  previousMondayVN.setDate(
    currentMondayVN.getDate() - 7
  );

  const startUtc =
    toUtcFromVietnamWallClock(
      previousMondayVN
    );

  const endUtc =
    toUtcFromVietnamWallClock(
      currentMondayVN
    );

  /*
   * Canonical logical period identity uses the Vietnam
   * Monday date, not the previous UTC calendar date.
   *
   * Example:
   *   Monday 2026-08-24 00:00 ICT
   *   = 2026-08-23T17:00:00Z
   *   periodKey remains "2026-08-24".
   */
  const periodKey =
    `${previousMondayVN.getFullYear()}-` +
    `${String(
      previousMondayVN.getMonth() + 1
    ).padStart(2, "0")}-` +
    `${String(
      previousMondayVN.getDate()
    ).padStart(2, "0")}`;

  return {
    periodKey,
    startUtc:
      startUtc.toISOString(),
    endUtc:
      endUtc.toISOString(),
  };
}

async function issueWeeklyPeriod(io) {
  const window = weeklyWindow();

  const { data, error } =
    await supabase.rpc(
      "issue_weekly_leaderboard_rewards_atomic",
      {
        p_period_key:
          window.periodKey,
        p_period_start:
          window.startUtc,
        p_period_end:
          window.endUtc,
      }
    );

  if (error) {
    throw new Error(error.message);
  }

  const result = data || {};

  if (
    io &&
    result.success &&
    !result.already_issued
  ) {
    const message =
      "🎁 Bảng xếp hạng tuần đã " +
      "chốt và phát quà cho người thắng!";

    io.emit(
      "leaderboard.weekly_reset",
      {
        type: "weekly",
        periodKey:
          window.periodKey,
        message,
        timestamp:
          new Date().toISOString(),
      }
    );

    io.emit(
      "notification",
      {
        type:
          "leaderboard_reset",
        message,
      }
    );
  }

  return result;
}

async function issueMonthlyPeriod(io) {
  const window = monthlyWindow();

  const { data, error } =
    await supabase.rpc(
      "issue_spending_leaderboard_rewards_atomic",
      {
        p_run_type:
          "monthly",
        p_period_key:
          window.periodKey,
        p_period_start:
          window.startUtc,
        p_period_end:
          window.endUtc,
      }
    );

  if (error) {
    throw new Error(error.message);
  }

  const result = data || {};

  if (
    io &&
    result.success &&
    !result.already_issued &&
    !result.disabled
  ) {
    const message =
      "🎁 BXH chi tiêu tháng đã " +
      "chốt và phát quà cho top 3!";

    io.emit(
      "leaderboard.monthly_reset",
      {
        type: "monthly",
        periodKey:
          window.periodKey,
        message,
        timestamp:
          new Date().toISOString(),
      }
    );

    io.emit(
      "notification",
      {
        type: "monthly_reset",
        message,
      }
    );
  }

  return result;
}

async function issueYearlyPeriod(io) {
  const window = yearlyWindow();

  const { data, error } =
    await supabase.rpc(
      "issue_spending_leaderboard_rewards_atomic",
      {
        p_run_type:
          "yearly",
        p_period_key:
          window.periodKey,
        p_period_start:
          window.startUtc,
        p_period_end:
          window.endUtc,
      }
    );

  if (error) {
    throw new Error(error.message);
  }

  const result = data || {};

  if (
    io &&
    result.success &&
    !result.already_issued &&
    !result.disabled
  ) {
    const message =
      "🎁 BXH chi tiêu năm đã " +
      "chốt và phát quà cho top 3!";

    io.emit(
      "leaderboard.yearly_reset",
      {
        type: "yearly",
        periodKey:
          window.periodKey,
        message,
        timestamp:
          new Date().toISOString(),
      }
    );
  }

  return result;
}

async function checkAndReset(io) {
  const now = vietnamNow();

  if (now.getDay() !== 1) return;
  if (now.getHours() !== 0) return;
  if (now.getMinutes() > 1) return;

  try {
    const result =
      await issueWeeklyPeriod(io);

    console.log(
      "[RESET] Weekly DB authority:",
      result
    );
  } catch (error) {
    console.error(
      "[RESET] Weekly error:",
      error.message
    );
  }
}

async function checkAndResetMonthly(io) {
  const now = vietnamNow();

  if (now.getDate() !== 1) return;
  if (now.getHours() !== 0) return;
  if (now.getMinutes() > 1) return;

  try {
    const result =
      await issueMonthlyPeriod(io);

    console.log(
      "[RESET] Monthly DB authority:",
      result
    );
  } catch (error) {
    console.error(
      "[RESET] Monthly error:",
      error.message
    );
  }
}

async function checkAndResetYearly(io) {
  const now = vietnamNow();

  if (
    now.getMonth() !== 0 ||
    now.getDate() !== 1
  ) {
    return;
  }

  if (now.getHours() !== 0) return;
  if (now.getMinutes() > 1) return;

  try {
    const result =
      await issueYearlyPeriod(io);

    console.log(
      "[RESET] Yearly DB authority:",
      result
    );
  } catch (error) {
    console.error(
      "[RESET] Yearly error:",
      error.message
    );
  }
}

async function doWeeklyReset(io) {
  return issueWeeklyPeriod(io);
}

async function manualWeeklyReset(io) {
  console.log(
    "[RESET] Manual weekly trigger via DB authority..."
  );

  return issueWeeklyPeriod(io);
}

async function manualMonthlyReset(io) {
  console.log(
    "[RESET] Manual monthly trigger via DB authority..."
  );

  return issueMonthlyPeriod(io);
}

function getLastMonday() {
  const now = vietnamNow();

  const daysBack =
    (now.getDay() + 6) % 7;

  const mondayVN =
    new Date(now);

  mondayVN.setDate(
    now.getDate() - daysBack
  );

  mondayVN.setHours(
    0, 0, 0, 0
  );

  return toUtcFromVietnamWallClock(
    mondayVN
  ).toISOString();
}


/**
 * Check và notify khi có top 1 mới ở bất kỳ BXH nào
 */
async function checkAndNotifyTop1Changes(io) {
  try {
    const { data: cfg } = await supabase.from('app_configs')
      .select('leaderboard_config, alltime_games_config, top1_cache')
      .eq('id', 1)
      .single();

    const lbCfg = cfg?.leaderboard_config || {};
    const alltimeGamesCfg = cfg?.alltime_games_config || {};
    const cache = cfg?.top1_cache || {};
    const newCache = { ...cache };
    const notifications = [];
    let cacheTouched = false;

    const hasCacheKey = (key) => Object.prototype.hasOwnProperty.call(cache, key);

    const rememberTop1 = ({ cacheKey, userId, name, board }) => {
      if (!cacheKey || !userId) return;

      const nextUserId = String(userId);
      const prevUserId = cache[cacheKey] == null ? null : String(cache[cacheKey]);

      if (!hasCacheKey(cacheKey)) {
        // Board mới hoặc cache key mới: baseline im lặng để tránh spam thông báo hàng loạt sau deploy.
        newCache[cacheKey] = nextUserId;
        cacheTouched = true;
        console.log(`[TOP1] Baseline cache set for ${cacheKey}: ${nextUserId}`);
        return;
      }

      if (prevUserId !== nextUserId) {
        newCache[cacheKey] = nextUserId;
        cacheTouched = true;
        notifications.push({
          cacheKey,
          userId: nextUserId,
          name: name || nextUserId,
          board,
        });
      }
    };

    const resolveUserDisplayName = async (row) => {
      if (!row?.user_id) return resolvePlayerName(row || {});
      const { data: p } = await supabase
        .from('players')
        .select('display_name, zalo_name, name')
        .eq('user_id', row.user_id)
        .maybeSingle();

      return resolvePlayerName(p || row);
    };

    const addSpendingBoard = async ({ period, col, board }) => {
      const { data, error } = await supabase
        .from('players')
        .select(`user_id, display_name, zalo_name, name, ${col}`)
        .gt(col, 0)
        .order(col, { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn(`[TOP1] Spending board failed ${period}:`, error.message);
        return;
      }

      if (!data?.user_id) return;

      rememberTop1({
        cacheKey: `spending_${period}_top1`,
        userId: data.user_id,
        name: resolvePlayerName(data),
        board,
      });
    };

    const getGameTop1 = async ({ gameKey, weekly }) => {
      let query = supabase
        .from('game_scores')
        .select('user_id, player_name, score, played_at')
        .eq('game_key', gameKey)
        .gt('score', 0)
        .order('score', { ascending: false })
        .order('played_at', { ascending: true })
        .limit(2000);

      if (weekly) {
        query = query.gte('played_at', getLastMonday());
      }

      const { data, error } = await query;

      if (error) {
        console.warn(`[TOP1] Game board failed ${gameKey}:`, error.message);
        return null;
      }

      const bestMap = new Map();
      for (const s of (data || [])) {
        const uid = String(s.user_id);
        const prev = bestMap.get(uid);

        if (
          !prev ||
          Number(s.score || 0) > Number(prev.score || 0) ||
          (
            Number(s.score || 0) === Number(prev.score || 0) &&
            new Date(s.played_at).getTime() < new Date(prev.played_at).getTime()
          )
        ) {
          bestMap.set(uid, s);
        }
      }

      return [...bestMap.values()].sort((a, b) => {
        if (Number(b.score || 0) !== Number(a.score || 0)) {
          return Number(b.score || 0) - Number(a.score || 0);
        }
        return new Date(a.played_at).getTime() - new Date(b.played_at).getTime();
      })[0] || null;
    };

    const addGameBoard = async ({ gameKey, gameCfg = {}, weekly }) => {
      if (
        !gameKey ||
        gameKey === 'chess' ||
        gameKey === 'chess-wins' ||
        gameKey === 'chess-streak'
      ) return;

      const top = await getGameTop1({ gameKey, weekly });
      if (!top?.user_id) return;

      const displayName = gameCfg.display_name || gameCfg.name || gameKey;
      const name = await resolveUserDisplayName(top);

      rememberTop1({
        cacheKey: `game_${weekly ? 'weekly' : 'alltime'}_${gameKey}_top1`,
        userId: top.user_id,
        name,
        board: weekly ? `BXH ${displayName} tuần` : `BXH ${displayName} mọi thời đại`,
      });
    };

    const addChessBoard = async ({ mode, orderCol, board }) => {
      const { data: top, error } = await supabase
        .from('chess_stats')
        .select('user_id, wins, best_streak')
        .gt(orderCol, 0)
        .order(orderCol, { ascending: false })
        .order('wins', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn(`[TOP1] Chess board failed ${mode}:`, error.message);
        return;
      }

      if (!top?.user_id) return;

      const name = await resolveUserDisplayName(top);

      rememberTop1({
        cacheKey: `chess_${mode}_top1`,
        userId: top.user_id,
        name,
        board,
      });
    };

    // 1. BXH tiêu dùng
    await addSpendingBoard({
      period: 'weekly',
      col: 'crm_spend_weekly',
      board: 'BXH Chi tiêu tuần',
    });

    await addSpendingBoard({
      period: 'monthly',
      col: 'crm_spend_monthly',
      board: 'BXH Chi tiêu tháng',
    });

    await addSpendingBoard({
      period: 'yearly',
      col: 'crm_spend_yearly',
      board: 'BXH Chi tiêu năm',
    });

    await addSpendingBoard({
      period: 'alltime',
      col: 'crm_spend_alltime',
      board: 'BXH Chi tiêu mọi thời đại',
    });

    await addSpendingBoard({
      period: 'custom',
      col: 'crm_spend_custom',
      board: 'BXH Chi tiêu theo mốc thời gian',
    });

    // 2. BXH chess
    await addChessBoard({
      mode: 'wins',
      orderCol: 'wins',
      board: 'BXH Kỳ thủ cờ vua - số trận thắng',
    });

    await addChessBoard({
      mode: 'streak',
      orderCol: 'best_streak',
      board: 'BXH Kỳ thủ cờ vua - chuỗi thắng',
    });

    // 3. BXH game tuần theo leaderboard_config.games
    const weeklyGames = lbCfg.games || {};
    for (const [gameKey, gameCfg] of Object.entries(weeklyGames)) {
      if (gameCfg?.enabled === false) continue;
      if (gameCfg?.weekly_reset === false) continue;

      await addGameBoard({
        gameKey,
        gameCfg,
        weekly: true,
      });
    }

    // 4. BXH game alltime theo alltime_games_config.games.
    // Nếu alltime_games_config chưa có games, fallback sang leaderboard_config.games.
    const alltimeGames = Object.keys(alltimeGamesCfg.games || {}).length > 0
      ? alltimeGamesCfg.games
      : weeklyGames;

    for (const [gameKey, gameCfg] of Object.entries(alltimeGames)) {
      if (gameCfg?.enabled === false) continue;

      await addGameBoard({
        gameKey,
        gameCfg,
        weekly: false,
      });
    }

    if (notifications.length === 0) {
      if (cacheTouched) {
        await supabase.from('app_configs').update({ top1_cache: newCache }).eq('id', 1);
        console.log('[TOP1] Cache baseline updated with no broadcast');
      }
      return;
    }

    const ioInstance = io || global._ioInstance || global.io;
    if (!ioInstance) {
      console.warn('[TOP1] No io instance available - skip cache update so notification can retry later');
      return;
    }

    let broadcasted = 0;

    for (const notif of notifications) {
      const msg = `🏆 Chúc mừng ${notif.name} đã xuất sắc leo lên Top 1 ${notif.board}!`;
      console.log('[TOP1]', msg);

      try {
        ioInstance.emit('notification.broadcast', {
          notification: {
            title: '🏆 Top 1 mới!',
            message: msg,
            type: 'leaderboard',
            created_at: new Date().toISOString(),
          },
          ticker: {
            enabled: true,
            message: msg,
          },
          data: {
            event: 'leaderboard.top1_changed',
            cacheKey: notif.cacheKey,
            userId: notif.userId,
            board: notif.board,
          },
        });

        broadcasted += 1;
        console.log('[TOP1] Broadcasted via socket.io');
      } catch (emitErr) {
        console.warn('[TOP1] Broadcast failed:', emitErr.message);
      }
    }

    if (broadcasted > 0) {
      await supabase.from('app_configs').update({ top1_cache: newCache }).eq('id', 1);
      console.log(`[TOP1] Cache updated after ${broadcasted} broadcast(s)`);
    } else {
      console.warn('[TOP1] No broadcast succeeded - cache not updated');
    }
  } catch(e) { console.warn('[TOP1] Error:', e.message); }
}


module.exports = { scheduleWeeklyReset, manualWeeklyReset, manualMonthlyReset, doWeeklyReset, checkAndNotifyTop1Changes };

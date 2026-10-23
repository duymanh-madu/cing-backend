const supabase = require('../../../supabase');
const { getGameLeaderboard } = require('../../leaderboardService');
const { resolveAuthenticatedUserId } = require('./cingBlockPuzzleSessionService');
const { weekWindow } = require('./domain/cingBlockPuzzleWeekWindow');
async function getWeeklyProgress({customer}) {
  const userId = resolveAuthenticatedUserId(customer);
  // Retry once when a week boundary is crossed during database reads.
  for (let attempt=0;attempt<2;attempt++) {
    const period = weekWindow();
    const [rows, personal] = await Promise.all([
      getGameLeaderboard('cing-block-puzzle',{weekly:true,limit:2000,weekStart:period.starts_at,strictPlayerRead:true}),
      supabase.from('game_scores').select('score').eq('game_key','cing-block-puzzle').eq('user_id',userId)
        .gte('played_at',period.starts_at).lt('played_at',period.ends_at).order('score',{ascending:false}).limit(1),
    ]);
    if (personal.error) throw personal.error;
    if (weekWindow().starts_at !== period.starts_at) continue;
    const bestScore = Number(personal.data?.[0]?.score || 0);
    return {period,generated_at:new Date().toISOString(),valid_for_ms:45000,scoring:'weekly_best',
      self:{user_id:userId,best_score:bestScore,rank:rows.find(row=>String(row.user_id)===userId)?.rank || null},
      // Same bounded published-board source used by the existing weekly UI.
      // Never infer a full rank from this list when a player is outside it.
      coverage:'published_board',
      rivals:rows.filter(row=>String(row.user_id)!==userId && row.score>=bestScore).map(row=>({
        user_id:row.user_id,player_name:row.player_name,avatar:row.avatar,score:row.score,rank:row.rank,
      }))};
  }
  throw Object.assign(new Error('BXH đang chuyển tuần, vui lòng thử lại'),{statusCode:503});
}
module.exports = { weekWindow, getWeeklyProgress };

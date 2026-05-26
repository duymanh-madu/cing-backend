const supabase = require('../../supabase');
const foodbook = require('../foodbook');

function getPeriodDates() {
  const VN  = 7 * 60 * 60 * 1000;
  const now = new Date(Date.now() + VN);
  const pad = n => String(n).padStart(2,'0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay()+6)%7));
  weekStart.setHours(0,0,0,0);

  const monthStart   = new Date(now.getFullYear(), now.getMonth(), 1);
  const quarter      = Math.floor(now.getMonth()/3);
  const quarterStart = new Date(now.getFullYear(), quarter*3, 1);
  const yearStart    = new Date(now.getFullYear(), 0, 1);
  const nowStr       = fmt(now);

  return {
    week:    { from: fmt(weekStart),    to: nowStr },
    month:   { from: fmt(monthStart),   to: nowStr },
    quarter: { from: fmt(quarterStart), to: nowStr },
    year:    { from: fmt(yearStart),    to: nowStr },
  };
}

async function fetchPeriodSpend(userId, from, to) {
  const result = await foodbook.getMembershipLog(userId, {
    log_type:    'PAY',
    create_from: from,
    create_to:   to,
    page_size:   500,
  });
  return result.data?.total_spent || 0;
}

async function syncOnePlayer(player) {
  const userId = player.phone_number || player.zalo_user_id;
  if (!userId) return null;

  try {
    const memberResult  = await foodbook.getMember(userId);
    const memberData    = memberResult?.data?.data || {};
    const allTimeSpent  = Number(memberData.payment_amount || 0);
    const allTimeOrders = Number(memberData.eat_times || 0);

    const periods = getPeriodDates();
    const [weekly, monthly, quarterly, yearly] = await Promise.all([
      fetchPeriodSpend(userId, periods.week.from,    periods.week.to),
      fetchPeriodSpend(userId, periods.month.from,   periods.month.to),
      fetchPeriodSpend(userId, periods.quarter.from, periods.quarter.to),
      fetchPeriodSpend(userId, periods.year.from,    periods.year.to),
    ]);

    const { error } = await supabase
      .from('players')
      .update({
        crm_spend_alltime:   allTimeSpent,
        crm_spend_weekly:    weekly,
        crm_spend_monthly:   monthly,
        crm_spend_quarterly: quarterly,
        crm_spend_yearly:    yearly,
        crm_orders_alltime:  allTimeOrders,
        crm_synced_at:       new Date().toISOString(),
      })
      .eq('user_id', player.user_id);

    if (error) {
      console.error('Supabase error:', player.user_id, error.message);
      return { user_id: player.user_id, success: false };
    }

    console.log(`Synced ${player.zalo_name||userId}: all=${allTimeSpent} week=${weekly} month=${monthly}`);
    return { user_id: player.user_id, success: true, allTimeSpent, weekly, monthly, quarterly, yearly };

  } catch (err) {
    console.error('syncOnePlayer error:', userId, err.message);
    return { user_id: player.user_id, success: false, error: err.message };
  }
}

async function syncAllPlayersCrmSpending({ batchSize=3, delayMs=2000 } = {}) {
  console.log('START CRM SYNC...');
  const t0 = Date.now();

  const { data: players, error } = await supabase
    .from('players')
    .select('user_id, zalo_user_id, phone_number, zalo_name')
    .not('phone_number', 'is', null);

  if (error) return { success: false, error: error.message };

  console.log('Players to sync:', players.length);
  const stats = { success:0, failed:0, skipped:0 };

  for (let i = 0; i < players.length; i += batchSize) {
    const batch   = players.slice(i, i+batchSize);
    const results = await Promise.all(batch.map(p => syncOnePlayer(p)));
    results.forEach(r => {
      if (!r) stats.skipped++;
      else if (r.success) stats.success++;
      else stats.failed++;
    });
    if (i+batchSize < players.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  const elapsed = ((Date.now()-t0)/1000).toFixed(1);
  console.log(`SYNC DONE ${elapsed}s`, stats);
  return { success: true, stats, elapsed_seconds: elapsed, total: players.length };
}

async function syncSingleUserSpending(userId) {
  const { data: player, error } = await supabase
    .from('players')
    .select('user_id, zalo_user_id, phone_number, zalo_name')
    .eq('user_id', userId)
    .single();
  if (error || !player) return { success: false, error: 'Player not found' };
  return syncOnePlayer(player);
}

module.exports = {
  syncAllPlayersCrmSpending,
  syncSingleUserSpending,
  syncOnePlayer,
  getPeriodDates,
  fetchPeriodSpend,
};

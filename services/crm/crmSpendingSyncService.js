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

// user_id trong Supabase chính là số điện thoại (0xxx hoặc 84xxx)
// iPos chấp nhận cả 2 format
function isPhoneId(userId) {
  return /^(0|84)\d{8,10}$/.test(String(userId));
}

async function syncOnePlayer(player) {
  const userId = player.user_id;
  if (!userId || !isPhoneId(userId)) return null;

  try {
    const memberResult  = await foodbook.getMember(userId);
    const memberData    = memberResult?.data?.data || {};

    if (!memberData.phone_number) {
      console.log(`Skip ${userId}: not found in iPos`);
      return { user_id: userId, success: false, error: 'not in iPos' };
    }

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
      .eq('user_id', userId);

    if (error) {
      console.error('Supabase error:', userId, error.message);
      return { user_id: userId, success: false };
    }

    console.log(`Synced ${memberData.name||userId}: all=${allTimeSpent} week=${weekly} month=${monthly}`);
    return { user_id: userId, success: true, allTimeSpent, weekly, monthly, quarterly, yearly };

  } catch (err) {
    console.error('syncOnePlayer error:', userId, err.message);
    return { user_id: userId, success: false, error: err.message };
  }
}

async function syncAllPlayersCrmSpending({ batchSize=3, delayMs=2000 } = {}) {
  console.log('START CRM SYNC...');
  const t0 = Date.now();

  const { data: players, error } = await supabase
    .from('players')
    .select('user_id, zalo_name');

  if (error) return { success: false, error: error.message };

  // Chỉ sync những user_id là số điện thoại
  const filtered = players.filter(p => isPhoneId(p.user_id));
  console.log(`Players: ${players.length} total, ${filtered.length} with phone ID`);

  const stats = { success:0, failed:0, skipped:0 };

  for (let i = 0; i < filtered.length; i += batchSize) {
    const batch   = filtered.slice(i, i+batchSize);
    const results = await Promise.all(batch.map(p => syncOnePlayer(p)));
    results.forEach(r => {
      if (!r) stats.skipped++;
      else if (r.success) stats.success++;
      else stats.failed++;
    });
    if (i+batchSize < filtered.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  const elapsed = ((Date.now()-t0)/1000).toFixed(1);
  console.log(`SYNC DONE ${elapsed}s`, stats);
  return { success: true, stats, elapsed_seconds: elapsed, total: filtered.length };
}

async function syncSingleUserSpending(userId) {
  const player = { user_id: String(userId) };
  return syncOnePlayer(player);
}

module.exports = {
  syncAllPlayersCrmSpending,
  syncSingleUserSpending,
  syncOnePlayer,
  getPeriodDates,
  fetchPeriodSpend,
};

const supabase = require("../supabase");

const PARTNER_MONTHLY_TARGET = 2000000; // 2 trieu / thang

function getVNDate() {
  // UTC+7 Vietnam timezone
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
}

function getCurrentYearMonth() {
  const now = getVNDate();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getPrevYearMonth() {
  const now = getVNDate();
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Cap nhat chi tieu thang cho partner sau moi don hang
 */
async function updatePartnerMonthlySpending({ user_id, amount }) {
  const yearMonth = getCurrentYearMonth();

  const { data: existing } = await supabase
    .from("partner_monthly_spending")
    .select("*")
    .eq("user_id", user_id)
    .eq("year_month", yearMonth)
    .maybeSingle();

  const newTotal = Number(existing?.total_spent || 0) + Number(amount);
  const qualified = newTotal >= PARTNER_MONTHLY_TARGET;

  await supabase.from("partner_monthly_spending").upsert({
    user_id,
    year_month: yearMonth,
    total_spent: newTotal,
    qualified,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,year_month" });

  return { year_month: yearMonth, total_spent: newTotal, qualified };
}

/**
 * Lay tien do thang hien tai va thang truoc
 * De hien thi thanh tien do 2 nua tren card
 */
async function getPartnerProgress(user_id) {
  const currentMonth = getCurrentYearMonth();
  const prevMonth = getPrevYearMonth();

  const { data } = await supabase
    .from("partner_monthly_spending")
    .select("*")
    .eq("user_id", user_id)
    .in("year_month", [currentMonth, prevMonth]);

  const current = data?.find(d => d.year_month === currentMonth);
  const prev = data?.find(d => d.year_month === prevMonth);

  const currentQualified = current?.qualified || false;
  const prevQualified = prev?.qualified || false;

  // Chi thang hang khi ca 2 thang lien tiep dat muc tieu
  const canPromote = currentQualified && prevQualified;

  // Tien do: 0 - 1 (moi nua tuong ung 1 thang)
  const prevProgress = prevQualified ? 0.5 : Math.min(0.5, (prev?.total_spent || 0) / PARTNER_MONTHLY_TARGET / 2);
  const currentProgress = currentQualified ? 0.5 : Math.min(0.5, (current?.total_spent || 0) / PARTNER_MONTHLY_TARGET / 2);
  const totalProgress = prevProgress + currentProgress;

  return {
    current_month: currentMonth,
    prev_month: prevMonth,
    current_spent: current?.total_spent || 0,
    prev_spent: prev?.total_spent || 0,
    current_qualified: currentQualified,
    prev_qualified: prevQualified,
    can_promote: canPromote,
    progress: totalProgress, // 0-1
    target: PARTNER_MONTHLY_TARGET,
  };
}

module.exports = { updatePartnerMonthlySpending, getPartnerProgress, PARTNER_MONTHLY_TARGET };

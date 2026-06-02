const express = require("express");
const router = express.Router();
const redisClient = require("../services/infrastructure/cache/redisClient");
const { getMember, getMemberVouchers } = require("../services/foodbook");

const CACHE_TTL = 300; // 5 phut fallback TTL

function mapTierKey(name) {
  // QUAN TRONG: check "đối tác thân thiết" TRƯỚC "thân thiết"
  if (!name) return "member";
  const n = name.toLowerCase();
  if (n.includes("kim") && (n.includes("cuong") || n.includes("cương"))) return "diamond";
  if (n.includes("vàng") || n.includes("vang")) return "gold";
  if (n.includes("bạc") || n.includes("bac")) return "silver";
  if (n.includes("đối tác thân thiết") || n.includes("doi tac than thiet") || n === "dttt") return "loyal_partner";
  if (n.includes("thân thiết") || n.includes("than thiet")) return "loyal";
  if (n.includes("đối tác") || n.includes("doi tac")) return "partner";
  return "member";
}

// GET /api/membership/:phone
router.get("/:phone", async (req, res) => {
  try {
    const phone = (req.params.phone || "").replace(/\D/g, "");
    if (!phone) return res.status(400).json({ success: false, message: "Thiếu phone" });

    const cacheKey = `membership:${phone}`;

    // 1. Check Redis cache truoc
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached);
      console.log(`[MEMBERSHIP] Cache HIT for ${phone}`);
      return res.json({ success: true, data, source: "cache" });
    }

    // 2. Cache miss - fetch tu iPOS
    console.log(`[MEMBERSHIP] Cache MISS for ${phone} - fetching iPOS`);
    const result = await getMember(phone);

    if (!result.success || !result.data?.data) {
      return res.status(404).json({ success: false, message: "Không tìm thấy thành viên" });
    }

    const d = result.data.data;
    const memberData = {
      id: d.id,
      phone: String(d.phone_number),
      name: d.name,
      tierKey: mapTierKey(d.membership_type_name),
      tierName: d.membership_type_name,
      points: Math.floor(d.point || 0),
      pointAmount: d.point_amount || 0,
      paymentAmount: d.payment_amount || 0,
      eatTimes: d.eat_times || 0,
      firstVisit: d.first_eat_date,
      lastVisit: d.last_eat_date,
      birthday: d.birthday,
      zaloId: d.zalo_id,
      isZaloFollow: d.is_zalo_follow === 1,
      city: d.city_name,
      tags: d.tags || [],
      updatedAt: Date.now(),
    };

    // Override birthday từ Supabase (ưu tiên hơn iPOS)
    try {
      const supabase = require("../supabase");
      const { data: customer } = await supabase
        .from("customers").select("birthday").eq("phone", phone).maybeSingle();
      if (customer?.birthday) memberData.birthday = customer.birthday;
    } catch(e) {}

    // 3. Luu vao Redis 5 phut
    await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(memberData));

    // Sync iPOS points vao players table
    try {
      const supabase = require("../supabase");
      await supabase.from("players").upsert({
        user_id: phone, phone, zalo_name: memberData.name,
        total_points: Math.floor(memberData.points || 0),
        crm_tier: memberData.tierKey,
      }, { onConflict: "user_id" });
    } catch(e) { console.warn("[MEMBERSHIP] Sync failed:", e.message); }
    return res.json({ success: true, data: memberData, source: "ipos" });
  } catch (err) {
    console.error("membership route error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/membership/:phone/vouchers
router.get("/:phone/vouchers", async (req, res) => {
  try {
    const phone = (req.params.phone || "").replace(/\D/g, "");
    const cacheKey = `membership:vouchers:${phone}`;
    
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.json({ success: true, data: JSON.parse(cached), source: "cache" });

    const result = await getMemberVouchers(phone);
    if (result.success && result.data) {
      await redisClient.setex(cacheKey, 120, JSON.stringify(result.data));
    }
    return res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

// GET /api/membership/:user_id/partner-progress
router.get("/:user_id/partner-progress", async (req, res) => {
  try {
    const { getPartnerProgress } = require("../services/partnerProgressService");
    const data = await getPartnerProgress(req.params.user_id);
    res.json({ success: true, data });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/membership/:phone/transactions — lịch sử giao dịch cả 2 luồng app + iPOS
router.get("/:phone/transactions", async (req, res) => {
  try {
    const phone = (req.params.phone || "").replace(/\D/g, "");
    if (!phone) return res.status(400).json({ success:false, message:"Thiếu số điện thoại" });

    const supabase = require("../supabase");
    const { getMemberTransactions, getMembershipLog } = require("../services/foodbook");
    const userId84 = phone.startsWith("84") ? phone : "84" + phone.slice(1);

    // Fetch song song cả 2 nguồn
    const [appOrders, appPayments, iposTxn, iposLog] = await Promise.all([
      // Đơn hàng từ app
      supabase.from("orders")
        .select("id,order_code,total_amount,status,payment_method,payment_status,created_at,items")
        .eq("customer_phone", phone)
        .order("created_at", { ascending:false })
        .limit(50),
      // Giao dịch thanh toán từ app
      supabase.from("payment_transactions")
        .select("id,transaction_code,amount,payment_status,payment_method,created_at")
        .eq("user_id", phone)
        .order("created_at", { ascending:false })
        .limit(50),
      // Lịch sử giao dịch từ iPOS
      getMemberTransactions(userId84, 1),
      // Lịch sử điểm từ iPOS
      getMembershipLog(userId84, { page:1, log_type:"PAY", page_size:100 }),
    ]);

    // Tổng hợp thống kê
    const appRevenue = (appPayments.data||[])
      .filter(p => p.payment_status === "paid")
      .reduce((s,p) => s + Number(p.amount||0), 0);
    const iposRevenue = iposTxn.data?.total_spent || 0;

    res.json({ success:true, data: {
      app: {
        orders:   appOrders.data || [],
        payments: appPayments.data || [],
        revenue:  appRevenue,
        total_orders: appOrders.data?.length || 0,
      },
      ipos: {
        transactions: iposTxn.data?.transactions || [],
        logs:         iposLog.data?.logs || [],
        revenue:      iposRevenue,
        total_orders: iposTxn.data?.total_orders || 0,
      },
      summary: {
        total_revenue:   appRevenue + iposRevenue,
        total_orders:    (appOrders.data?.length||0) + (iposTxn.data?.total_orders||0),
      },
    }});
  } catch(err) {
    res.status(500).json({ success:false, error:err.message });
  }
});

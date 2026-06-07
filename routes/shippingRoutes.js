const express    = require("express");
const router     = express.Router();
const supabase   = require("../supabase");
const { getEstimateShipFee } = require("../services/foodbook");

/**
 * =====================================================
 * HELPER: Tính phí ship từ shipping_tiers trong DB
 * =====================================================
 * shipping_tiers: [{ min_order, max_order, fee_per_km, base_fee, label }]
 */
function calcShipFeeFromTiers(tiers, distanceKm, amount) {
  if (!tiers || tiers.length === 0) return null;

  // Tìm tier phù hợp với giá trị đơn hàng
  const tier = tiers.find(t =>
    amount >= (t.min_order || 0) &&
    amount <= (t.max_order || 999999999)
  );
  if (!tier) return null;

  const fee = (tier.base_fee || 0) + distanceKm * (tier.fee_per_km || 0);
  return Math.round(fee / 1000) * 1000; // Làm tròn 1000đ
}

/**
 * =====================================================
 * HELPER: Tính khoảng cách từ tọa độ
 * =====================================================
 */
function calcDistKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dL = (lat2 - lat1) * Math.PI / 180;
  const dl = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dL/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/**
 * =====================================================
 * GET /shipping/estimate
 * =====================================================
 * Priority:
 * 1. iPos foodbook API
 * 2. shipping_tiers từ app_configs (DB)
 * 3. shipping_fee_per_km từ app_configs (DB)
 * =====================================================
 */
router.get("/estimate", async (req, res) => {
  try {
    const { lat, lng, amount } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, error: "Missing lat/lng" });
    }

    const latF    = parseFloat(lat);
    const lngF    = parseFloat(lng);
    const amountF = parseFloat(amount || 0);

    // Load config từ DB
    const { data: config } = await supabase
      .from("app_configs")
      .select("shipping_tiers, shipping_fee_per_km, free_shipping_threshold, store_latitude, store_longitude, max_delivery_distance")
      .eq("id", 1)
      .single();

    // Tính khoảng cách
    const storeLat = config?.store_latitude  || 21.112192;
    const storeLng = config?.store_longitude || 105.948687;
    const distKm   = calcDistKm(latF, lngF, storeLat, storeLng);
    const maxDist  = config?.max_delivery_distance || 10;

    // Vượt khoảng cách tối đa → liên hệ
    if (distKm > maxDist) {
      return res.json({
        success:  true,
        ship_fee: -1,
        dist_km:  Math.round(distKm * 10) / 10,
        reason:   "OUT_OF_RANGE",
      });
    }

    // Miễn ship
    const freeThreshold = config?.free_shipping_threshold || 0;
    if (freeThreshold > 0 && amountF >= freeThreshold) {
      return res.json({
        success:  true,
        ship_fee: 0,
        dist_km:  Math.round(distKm * 10) / 10,
        reason:   "FREE_SHIP",
      });
    }

    // Priority 1: iPos foodbook
    const iposResult = await getEstimateShipFee({ lat: latF, lng: lngF, amount: amountF });
    if (iposResult?.success && iposResult?.ship_fee !== null && iposResult?.ship_fee >= 0) {
      return res.json({
        success:  true,
        ship_fee: iposResult.ship_fee,
        dist_km:  Math.round(distKm * 10) / 10,
        reason:   "IPOS",
      });
    }

    // Priority 2: shipping_tiers từ DB
    const tiers = config?.shipping_tiers || [];
    const tierFee = calcShipFeeFromTiers(tiers, distKm, amountF);
    if (tierFee !== null) {
      return res.json({
        success:  true,
        ship_fee: tierFee,
        dist_km:  Math.round(distKm * 10) / 10,
        reason:   "TIERS",
      });
    }

    // Priority 3: fee_per_km từ DB
    const feePerKm = config?.shipping_fee_per_km || 5000;
    const fallbackFee = Math.round(distKm * feePerKm / 1000) * 1000;
    return res.json({
      success:  true,
      ship_fee: fallbackFee,
      dist_km:  Math.round(distKm * 10) / 10,
      reason:   "FEE_PER_KM",
    });

  } catch (err) {
    console.error("[SHIPPING] estimate error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * =====================================================
 * POST /shipping/calculate (legacy — giữ nguyên)
 * =====================================================
 */
router.post("/calculate", async (req, res) => {
  try {
    const { subtotal, distanceKm } = req.body;

    const { data: config } = await supabase
      .from("app_configs")
      .select("shipping_tiers, shipping_fee_per_km, free_shipping_threshold")
      .eq("id", 1)
      .single();

    const freeThreshold = config?.free_shipping_threshold || 200000;
    if (subtotal >= freeThreshold) {
      return res.json({ success: true, data: { fee: 0, reason: "FREE_SHIP" } });
    }

    const tiers   = config?.shipping_tiers || [];
    const tierFee = calcShipFeeFromTiers(tiers, distanceKm, subtotal);
    if (tierFee !== null) {
      return res.json({ success: true, data: { fee: tierFee, reason: "TIERS" } });
    }

    const feePerKm = config?.shipping_fee_per_km || 5000;
    const fee = Math.round(distanceKm * feePerKm / 1000) * 1000;
    return res.json({ success: true, data: { fee, reason: "FEE_PER_KM" } });

  } catch (error) {
    console.error("[SHIPPING] calculate error:", error);
    return res.status(500).json({ success: false, message: "Shipping calculate failed" });
  }
});


/**
 * =====================================================
 * POST /shipping/decode-location
 * =====================================================
 * Nhận token từ zmp-sdk getLocation()
 * Decode thành lat/lng qua Zalo API
 * Trả về lat/lng + phí ship luôn
 * =====================================================
 */
router.post("/decode-location", async (req, res) => {
  try {
    const { token, amount } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: "Missing location token" });
    }

    // Decode token → lat/lng qua Zalo Graph API
    const axios = require("axios");
    const zmpToken = process.env.ZMP_TOKEN;
    const appId    = process.env.ZALO_APP_ID;

    if (!zmpToken || !appId) {
      return res.status(500).json({ success: false, error: "Missing ZMP config" });
    }

    const zaloRes = await axios.get("https://graph.zalo.me/v2.0/me/location", {
      headers: {
        access_token: token,
        secret_key:   zmpToken,
      },
      params: { app_id: appId },
    }).catch(e => ({ data: e.response?.data || { error: e.message } }));

    const lat = zaloRes.data?.latitude  || zaloRes.data?.data?.latitude;
    const lng = zaloRes.data?.longitude || zaloRes.data?.data?.longitude;

    if (!lat || !lng) {
      console.error("[LOCATION] Decode failed:", JSON.stringify(zaloRes.data));
      return res.status(400).json({
        success: false,
        error:   "Cannot decode location token",
        raw:     zaloRes.data,
      });
    }

    const latF    = parseFloat(lat);
    const lngF    = parseFloat(lng);
    const amountF = parseFloat(amount || 0);

    // Load config từ DB
    const { data: config } = await supabase
      .from("app_configs")
      .select("shipping_tiers, shipping_fee_per_km, free_shipping_threshold, store_latitude, store_longitude, max_delivery_distance")
      .eq("id", 1)
      .single();

    const storeLat = config?.store_latitude  || 21.112192;
    const storeLng = config?.store_longitude || 105.948687;
    const distKm   = calcDistKm(latF, lngF, storeLat, storeLng);
    const maxDist  = config?.max_delivery_distance || 10;

    // Vượt khoảng cách tối đa
    if (distKm > maxDist) {
      return res.json({
        success:   true,
        latitude:  latF,
        longitude: lngF,
        ship_fee:  -1,
        dist_km:   Math.round(distKm * 10) / 10,
        reason:    "OUT_OF_RANGE",
      });
    }

    // Miễn ship
    const freeThreshold = config?.free_shipping_threshold || 0;
    if (freeThreshold > 0 && amountF >= freeThreshold) {
      return res.json({
        success:   true,
        latitude:  latF,
        longitude: lngF,
        ship_fee:  0,
        dist_km:   Math.round(distKm * 10) / 10,
        reason:    "FREE_SHIP",
      });
    }

    // iPos estimate
    const { getEstimateShipFee } = require("../services/foodbook");
    const iposResult = await getEstimateShipFee({ lat: latF, lng: lngF, amount: amountF });
    if (iposResult?.success && iposResult?.ship_fee !== null && iposResult?.ship_fee >= 0) {
      return res.json({
        success:   true,
        latitude:  latF,
        longitude: lngF,
        ship_fee:  iposResult.ship_fee,
        dist_km:   Math.round(distKm * 10) / 10,
        reason:    "IPOS",
      });
    }

    // Fallback tiers
    const tiers   = config?.shipping_tiers || [];
    const tierFee = calcShipFeeFromTiers(tiers, distKm, amountF);
    if (tierFee !== null) {
      return res.json({
        success:   true,
        latitude:  latF,
        longitude: lngF,
        ship_fee:  tierFee,
        dist_km:   Math.round(distKm * 10) / 10,
        reason:    "TIERS",
      });
    }

    // Fallback fee_per_km
    const feePerKm    = config?.shipping_fee_per_km || 5000;
    const fallbackFee = Math.round(distKm * feePerKm / 1000) * 1000;
    return res.json({
      success:   true,
      latitude:  latF,
      longitude: lngF,
      ship_fee:  fallbackFee,
      dist_km:   Math.round(distKm * 10) / 10,
      reason:    "FEE_PER_KM",
    });

  } catch (err) {
    console.error("[LOCATION] decode-location error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

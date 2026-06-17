const axios = require("axios");
const supabase = require("../supabase");

/**
 * ============================================
 * ENV
 * ============================================
 */
const IPOS_BASE_URL     = process.env.IPOS_BASE_URL || "https://api.foodbook.vn";
const IPOS_ACCESS_TOKEN = process.env.IPOS_ACCESS_TOKEN;
const IPOS_POS_PARENT   = process.env.IPOS_POS_PARENT;
const IPOS_POS_ID       = process.env.IPOS_POS_ID;

/**
 * ============================================
 * BUILD PAYLOAD
 * Chuẩn theo iPOS FoodHub docs
 * ============================================
 */
function buildPayload(order, momo_trans_id = "") {
  const rawPhone = (order.customer_phone || order.user_id || "").replace(/\D/g, "");

  // iPOS yêu cầu user_id dạng số 84xxxxxxxxx
  const iposUserId = rawPhone.startsWith("84")
    ? Number(rawPhone)
    : Number("84" + rawPhone.slice(1));

  // foodbook_code tối đa 10 ký tự — tran_id ZBS = prefix(12) + pos_id(6) + code <= 32
  const rawCode = (order.order_code || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const foodbook_code = rawCode.length > 10 ? rawCode.slice(-10) : rawCode;

  // Tự detect order_type: DELI nếu có địa chỉ giao, STORE nếu tại quán
  const order_type = order.order_type || (order.shipping_address ? "DELI" : "STORE");

  const payload = {
    pos_id:          Number(IPOS_POS_ID),
    pos_parent:      IPOS_POS_PARENT,
    foodbook_code,
    order_type,
    user_id:         iposUserId,
    username:        order.customer_name || "Khách hàng",
    note:            (() => {
      const userNote = order.note || order.customer_note || "";
      const prefix = order.payment_method === "points" ? "[Điểm tích lũy] " : "";
      return (prefix + userNote).trim();
    })(),
    to_address:      order.shipping_address || "",
    ship_price_real: order.shipping_fee || 0,
    amount:       order.total_amount || 0,
    total_amount: order.total_amount || 0,
    adapt_to_online: 1,
    return_data:     "full",
    is_pending:      0,
    is_estimate:     0,
    client: order.payment_method === "momo" ? "momo" : "online",
    PaymentInfo: {
      Payment_Method: "MOMO_QR_AIO",
      Payment_Info: momo_trans_id ? "MOMO-" + momo_trans_id : (order.payment_method === "momo" ? "MOMO" : ""),
      Amount: order.total_amount || 0,
      Trans_Verified: momo_trans_id ? 1 : 0,
    },

    // partner_voucher_info: truyền chiết khấu hạng thành viên + điểm tích lũy
    // iPos ghi nhận doanh thu = total_amount (giá trị thực khách trả)
    ...(() => {
      const tierDiscount  = order.tier_discount  || 0;
      const pointsDiscount = order.points_discount || (order.points_used ? order.points_used * 1000 : 0);
      const totalDiscount  = tierDiscount + pointsDiscount;
      if (totalDiscount <= 0) return {};
      const parts = [];
      if (tierDiscount > 0)   parts.push(`Ưu đãi hạng thành viên: -${tierDiscount.toLocaleString('vi-VN')}đ`);
      if (pointsDiscount > 0) parts.push(`Đổi ${order.points_used || 0} điểm: -${pointsDiscount.toLocaleString('vi-VN')}đ`);
      return {
        partner_voucher_info: {
          voucher_code:    "MEMBER-" + (order.order_code || "").slice(-8),
          discount_amount: totalDiscount,
          merchant_rate:   100,
          description:     parts.join(' | '),
        },
      };
    })(),

    order_data_item: (() => {
      const items = order.items || [];
      return items.map(item => {
        return {
          Item_Type_Id: item.category || "",
          Item_Id:      String(item.item_id || item.id || item.ipos_id || ""),
          Item_Name:    item.name || item.displayName || item.product_name || "",
          Price:        item.price || 0,
          Quantity:     item.quantity || item.qty || 1,
          Note:         item.note || "",
          Discount:     item.discount || 0,
          Foc:          0,
          Package_Id:   "",
          Parent_Id:    "",
          Fix:          0,
        };
      });
    })(),
  };

  // Thêm toạ độ và chi tiết địa chỉ nếu là đơn giao hàng
  if (order_type === "DELI") {
    if (order.latitude)       payload.latitude       = order.latitude;
    if (order.longitude)      payload.longitude      = order.longitude;
    if (order.address_detail) payload.address_detail = order.address_detail;
  }

  return payload;
}

/**
 * ============================================
 * CREATE IPOS LOG
 * ============================================
 */
async function createIposLog({ order_id, transaction_code, request_payload }) {
  try {
    const { data, error } = await supabase
      .from("ipos_logs")
      .insert({
        order_id,
        transaction_code,
        sync_status:     "pending",
        retry_count:     0,
        request_payload,
      })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  } catch (error) {
    console.error("createIposLog error:", error.message);
    return null;
  }
}

/**
 * ============================================
 * UPDATE IPOS LOG
 * ============================================
 */
async function updateIposLog({ log_id, updates }) {
  try {
    if (!log_id) return;
    const { error } = await supabase
      .from("ipos_logs")
      .update({ ...updates, updated_at: new Date() })
      .eq("id", log_id);
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("updateIposLog error:", error.message);
  }
}

/**
 * ============================================
 * CHECK DUPLICATE PUSH (idempotency)
 * ============================================
 */
async function checkExistingSuccess({ order_id }) {
  try {
    const { data, error } = await supabase
      .from("ipos_logs")
      .select("*")
      .eq("order_id", order_id)
      .eq("sync_status", "success")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return !!data;
  } catch (error) {
    console.error("checkExistingSuccess error:", error.message);
    return false;
  }
}

/**
 * ============================================
 * REALTIME EMIT
 * ============================================
 */
function emitRealtime({ event, payload }) {
  try {
    if (global.io) global.io.emit(event, payload);
  } catch (error) {
    console.error("emitRealtime error:", error.message);
  }
}

/**
 * ============================================
 * PUSH ORDER TO IPOS
 * FIX: access_token là query param — KHÔNG dùng Authorization Bearer
 * ============================================
 */
async function pushOrderToIPOS({ order, transaction_code, momo_trans_id = "" }) {
  if (!order) throw new Error("Missing order");

  // Idempotency — tránh push 2 lần cùng 1 đơn
  const alreadySynced = await checkExistingSuccess({ order_id: order.id });
  if (alreadySynced) {
    console.log("[IPOS] Already synced, skip:", order.order_code);
    return { success: true, duplicated: true };
  }

  const payload = buildPayload(order, momo_trans_id);

  // Debug log để verify payload trước khi gửi
  console.log("[IPOS] Pushing order:", order.order_code, "| payment_method:", order.payment_method);
  if (process.env.IPOS_DEBUG === "true") console.log("[IPOS] Amount debug:", {
    total_amount: order.total_amount,
    subtotal: order.subtotal,
    tier_discount: order.tier_discount,
    points_discount: order.points_discount,
    points_used: order.points_used,
    payload_amount: payload.amount,
    payload_total: payload.total_amount,
    payment_amount: payload.PaymentInfo?.Amount,
  });
  if (process.env.IPOS_DEBUG === "true") console.log("[IPOS] Payload preview:", JSON.stringify({
    foodbook_code: payload.foodbook_code,
    order_type:    payload.order_type,
    user_id:       payload.user_id,
    total_amount:  payload.total_amount,
    items_count:   payload.order_data_item?.length,
    client:        payload.client,
    PaymentInfo:   payload.PaymentInfo,
  }));

  const log = await createIposLog({
    order_id:        order.id,
    transaction_code,
    request_payload: payload,
  });

  try {
    // ✅ FIX CHÍNH: access_token đặt trong params (query string)
    // iPOS docs: ?access_token=XXXX — KHÔNG phải Authorization: Bearer
    const response = await axios.post(
      `${IPOS_BASE_URL}/ipos/ws/xpartner/order_online`,
      payload,
      {
        params: {
          access_token: IPOS_ACCESS_TOKEN,
        },
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const responseData = response.data;
    console.log("[IPOS] Response:", JSON.stringify(responseData).slice(0, 200));

    // Kiểm tra response có lỗi không
    if (responseData?.error) {
      throw new Error(responseData?.error?.message || "iPOS error code: " + responseData?.error?.code);
    }

    await updateIposLog({
      log_id: log?.id,
      updates: {
        sync_status:      "success",
        response_payload: responseData,
        ipos_order_id:    responseData?.order_id || responseData?.data?.order_id || null,
        synced_at:        new Date(),
      },
    });

    try {
      await supabase
        .from("orders")
        .update({
          pos_sync_status: "success",
          pos_synced_at:   new Date(),
          updated_at:      new Date(),
        })
        .eq("id", order.id);
    } catch (orderError) {
      console.error("order update error:", orderError.message);
    }

    emitRealtime({
      event:   "ipos_order_synced",
      payload: { order_id: order.id, transaction_code, sync_status: "success" },
    });

    return { success: true, ipos_response: responseData };

  } catch (error) {
    const errDetail = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;
    console.error("[IPOS] Push failed — status:", error.response?.status, "detail:", errDetail);

    await updateIposLog({
      log_id: log?.id,
      updates: {
        sync_status:      "failed",
        retry_count:      1,
        error_message:    errDetail,
        response_payload: {
          error:  errDetail,
          status: error.response?.status,
        },
      },
    });

    try {
      await supabase
        .from("orders")
        .update({
          pos_sync_status: "failed",
          pos_error:       errDetail,
          updated_at:      new Date(),
        })
        .eq("id", order.id);
    } catch (orderError) {
      console.error("order update error:", orderError.message);
    }

    emitRealtime({
      event:   "ipos_order_failed",
      payload: {
        order_id:        order.id,
        transaction_code,
        sync_status:     "failed",
        error:           errDetail,
      },
    });

    // Enqueue lightweight recovery job.
    // Chỉ retry đúng đơn iPOS bị fail, không quét toàn bộ orders.
    const { enqueueIposRecovery } =
      require("./ipos/iposSyncRecoveryWorker");

    await enqueueIposRecovery({
      order_id: order.id,
      transaction_code,
      reason: errDetail,
    }).catch(e =>
      console.warn("[IPOS RECOVERY] enqueue failed:", e.message)
    );

    return { success: false, error: errDetail };
  }
}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */
module.exports = { pushOrderToIPOS };
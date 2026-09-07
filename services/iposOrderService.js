const axios = require("axios");
const supabase = require("../supabase");

/**
 * ============================================
 * ENV
 * ============================================
 */
function getIposConfig() {
  return {
    baseUrl:
      process.env.IPOS_BASE_URL || "https://api.foodbook.vn",

    accessToken:
      process.env.IPOS_ACCESS_TOKEN,

    posParent:
      process.env.IPOS_POS_PARENT,

    posId:
      process.env.IPOS_POS_ID,
  };
}

function normalizeNonNegativeMoney(
  value,
  code
) {

  const numeric =
    Number(value ?? 0);

  if (
    !Number.isSafeInteger(numeric) ||
    numeric < 0
  ) {

    const error =
      new Error(code);

    error.code =
      code;

    throw error;

  }

  return numeric;

}


function resolveIposPaymentProjection(
  order = {},
  momoTransId = ""
) {

  const paymentMethod =
    String(
      order.payment_method || ""
    )
      .trim()
      .toLowerCase();


  const amount =
    normalizeNonNegativeMoney(
      order.total_amount,
      "IPOS_ORDER_TOTAL_INVALID"
    );


  /*
   * Cing Wallet is an iPOS-approved custom tender.
   *
   * In mixed Points + Wallet checkout, total_amount is already
   * the canonical remaining monetary amount after point discount.
   */
  if (
    paymentMethod ===
      "cing_wallet"
  ) {

    if (amount <= 0) {

      const error =
        new Error(
          "IPOS_WALLET_AMOUNT_INVALID"
        );

      error.code =
        "IPOS_WALLET_AMOUNT_INVALID";

      throw error;

    }


    return {

      Payment_Method:
        "CING_WALLET",

      Payment_Info:
        "CING_WALLET",

      Amount:
        amount,

      Trans_Verified:
        1,

    };

  }


  /*
   * MoMo remains the existing provider tender.
   */
  if (
    paymentMethod ===
      "momo"
  ) {

    if (amount <= 0) {

      const error =
        new Error(
          "IPOS_MOMO_AMOUNT_INVALID"
        );

      error.code =
        "IPOS_MOMO_AMOUNT_INVALID";

      throw error;

    }


    return {

      Payment_Method:
        "MOMO_QR_AIO",

      Payment_Info:
        momoTransId
          ? "MOMO-" + momoTransId
          : "MOMO",

      Amount:
        amount,

      Trans_Verified:
        momoTransId
          ? 1
          : 0,

    };

  }


  /*
   * Points-only must never masquerade as MoMo or Cing Wallet.
   *
   * iPOS public documentation does not expose the accepted
   * order_online Payment_Method enum for an internal loyalty
   * tender, so we require an explicit iPOS-approved method value.
   *
   * This is operational configuration, not financial authority:
   * amount remains canonical zero and discount comes from the
   * frozen order snapshot.
   */
  if (
    paymentMethod ===
      "points"
  ) {

    if (amount !== 0) {

      const error =
        new Error(
          "IPOS_POINTS_ONLY_AMOUNT_INVALID"
        );

      error.code =
        "IPOS_POINTS_ONLY_AMOUNT_INVALID";

      throw error;

    }


    const configuredMethod =
      String(
        process.env
          .IPOS_POINTS_PAYMENT_METHOD ||
        ""
      ).trim();


    if (!configuredMethod) {

      const error =
        new Error(
          "IPOS_POINTS_PAYMENT_METHOD_REQUIRED"
        );

      error.code =
        "IPOS_POINTS_PAYMENT_METHOD_REQUIRED";

      throw error;

    }


    return {

      Payment_Method:
        configuredMethod,

      Payment_Info:
        "LOYALTY_POINTS",

      Amount:
        0,

      Trans_Verified:
        1,

    };

  }


  const error =
    new Error(
      "IPOS_PAYMENT_METHOD_UNSUPPORTED"
    );

  error.code =
    "IPOS_PAYMENT_METHOD_UNSUPPORTED";

  throw error;

}


function normalizeIposOrderType(order = {}) {
  const raw =
    String(order.order_type || "").trim().toLowerCase();

  if (
    raw === "delivery" ||
    raw === "deli" ||
    String(order.shipping_address || "").trim()
  ) {
    return "DELI";
  }

  return "STORE";
}

/**
 * ============================================
 * BUILD PAYLOAD
 * Chuẩn theo iPOS FoodHub docs
 * ============================================
 */
function buildPayload(order, momo_trans_id = "") {
  const config = getIposConfig();

  if (!config.accessToken || !config.posParent || !config.posId) {
    throw new Error("missing_ipos_config");
  }

  const rawPhone = (order.customer_phone || order.user_id || "").replace(/\D/g, "");

  // iPOS yêu cầu user_id dạng số 84xxxxxxxxx
  const iposUserId = rawPhone.startsWith("84")
    ? Number(rawPhone)
    : Number("84" + rawPhone.slice(1));

  // foodbook_code tối đa 10 ký tự — tran_id ZBS = prefix(12) + pos_id(6) + code <= 32
  const rawCode = (order.order_code || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const foodbook_code = rawCode.length > 10 ? rawCode.slice(-10) : rawCode;

  const order_type =
    normalizeIposOrderType(order);


  const canonicalTotal =
    normalizeNonNegativeMoney(
      order.total_amount,
      "IPOS_ORDER_TOTAL_INVALID"
    );

  const canonicalPointsDiscount =
    normalizeNonNegativeMoney(
      order.points_discount,
      "IPOS_POINTS_DISCOUNT_INVALID"
    );

  const canonicalPointsUsed =
    Number(
      order.points_used ?? 0
    );


  if (
    !Number.isSafeInteger(
      canonicalPointsUsed
    ) ||
    canonicalPointsUsed < 0
  ) {

    const error =
      new Error(
        "IPOS_POINTS_USED_INVALID"
      );

    error.code =
      "IPOS_POINTS_USED_INVALID";

    throw error;

  }


  /*
   * A positive point count must always carry its frozen canonical
   * monetary discount. iPOS must never reconstruct that value.
   */
  if (
    canonicalPointsUsed > 0 &&
    canonicalPointsDiscount <= 0
  ) {

    const error =
      new Error(
        "IPOS_POINTS_DISCOUNT_REQUIRED"
      );

    error.code =
      "IPOS_POINTS_DISCOUNT_REQUIRED";

    throw error;

  }


  const payload = {
    pos_id:          Number(config.posId),
    pos_parent:      config.posParent,
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
    amount:
      canonicalTotal,

    total_amount:
      canonicalTotal,
    adapt_to_online: 1,
    return_data:     "full",
    is_pending:      0,
    is_estimate:     0,
    client: order.payment_method === "momo" ? "momo" : "online",
    PaymentInfo:
      resolveIposPaymentProjection(
        order,
        momo_trans_id
      ),

    // partner_voucher_info: truyền chiết khấu hạng thành viên + điểm tích lũy
    // iPos ghi nhận doanh thu = total_amount (giá trị thực khách trả)
    ...(() => {
      const tierDiscount =
        normalizeNonNegativeMoney(
          order.tier_discount,
          "IPOS_TIER_DISCOUNT_INVALID"
        );

      const pointsDiscount =
        normalizeNonNegativeMoney(
          order.points_discount,
          "IPOS_POINTS_DISCOUNT_INVALID"
        );

      const totalDiscount =
        tierDiscount +
        pointsDiscount;
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

  // Shipping Location Authority V2A+:
  // iPOS receives the exact durable destination selected by customer.
  if (order_type === "DELI") {
    const latitude =
      order.delivery_latitude;

    const longitude =
      order.delivery_longitude;

    if (
      latitude !== null &&
      latitude !== undefined &&
      longitude !== null &&
      longitude !== undefined
    ) {
      payload.latitude =
        Number(latitude);

      payload.longitude =
        Number(longitude);
    }

    if (
      order.delivery_address_detail
    ) {
      payload.address_detail =
        order.delivery_address_detail;
    }
  }

  return payload;
}

/**
 * ============================================
 * CREATE IPOS LOG
 * ============================================
 */
function isIposTemporaryRetryError(message = "") {
  const text = String(message || "").toLowerCase();

  return (
    text.includes("thao tác này liên tiếp") ||
    text.includes("thao tac nay lien tiep") ||
    text.includes("vui lòng chờ") ||
    text.includes("vui long cho") ||
    text.includes("try again later") ||
    text.includes("rate limit") ||
    text.includes('"code":301') ||
    text.includes("code:301")
  );
}

function isIposRecoverablePreflightError(
  message = ""
) {

  const text =
    String(
      message || ""
    );

  return (
    text.includes(
      "IPOS_POINTS_PAYMENT_METHOD_REQUIRED"
    ) ||
    text.includes(
      "missing_ipos_config"
    )
  );

}


function isIposAfterHoursError(message = "") {
  const text = String(message || "").toLowerCase();

  return (
    text.includes("ngừng phục vụ") ||
    text.includes("ngung phuc vu") ||
    text.includes("ngoài giờ") ||
    text.includes("ngoai gio") ||
    text.includes("sau giờ mở cửa") ||
    text.includes("sau gio mo cua") ||
    text.includes("giờ mở cửa") ||
    text.includes("gio mo cua") ||
    text.includes("closed") ||
    text.includes("outside business hours")
  );
}

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

  let log = null;

  try {

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

    log = await createIposLog({
      order_id:        order.id,
      transaction_code,
      request_payload: payload,
    });

    // ✅ FIX CHÍNH: access_token đặt trong params (query string)
    // iPOS docs: ?access_token=XXXX — KHÔNG phải Authorization: Bearer
    const config = getIposConfig();

    const response = await axios.post(
      `${config.baseUrl}/ipos/ws/xpartner/order_online`,
      payload,
      {
        params: {
          access_token: config.accessToken,
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
          ipos_order_id:   responseData?.order_id || responseData?.data?.order_id || null,
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

    const afterHours =
      isIposAfterHoursError(errDetail);

    const temporaryRetry =
      isIposTemporaryRetryError(
        errDetail
      ) ||
      afterHours ||
      isIposRecoverablePreflightError(
        errDetail
      );

    try {
      await supabase
        .from("orders")
        .update({
          // iPOS is configured 24/24, so after-hours errors are retried normally.
          pos_sync_status: temporaryRetry ? "pending" : "failed",
          ipos_sync_status: temporaryRetry ? "pending" : "failed",
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
        sync_status:     temporaryRetry ? "pending" : "failed",
        error:           errDetail,
      },
    });

    const { enqueueIposRecovery } =
      require("./ipos/iposSyncRecoveryWorker");

    await enqueueIposRecovery({
      order_id: order.id,
      transaction_code: order.order_code || transaction_code || String(order.id),
      reason: errDetail,
    }).catch(e =>
      console.warn("[IPOS RECOVERY] enqueue failed:", e.message)
    );

    if (
      String(errDetail || "")
        .toLowerCase()
        .includes("đơn hàng đã được chuyển xuống pos")
    ) {
      await supabase.from("orders").update({
        pos_sync_status: "success",
        pos_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", order.id).then(()=>{}).catch(()=>{});

      return { success: true, already_synced: true, message: errDetail };
    }

    return { success: false, error: errDetail };
  }
}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */
module.exports = { pushOrderToIPOS };

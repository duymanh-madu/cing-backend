"use strict";

const crypto =
  require("node:crypto");

const supabase =
  require("../../supabase");

const {
  realtimeEventBus,
} = require(
  "../realtime/realtimeEventBus"
);

const {
  assertPosEpaymentEnabled,
  createIposPosPayment,
  createQrCapability,
  normalizeAmount,
} = require(
  "./cingWalletPosPaymentService"
);


const POS_COUNTER_ENABLED_ENV =
  "CING_WALLET_POS_COUNTER_ENABLED";

const POS_TRIGGER_CODE_ENV =
  "CING_WALLET_POS_TRIGGER_CODE";

const POS_VOUCHER_PREFIX_ENV =
  "CING_WALLET_POS_VOUCHER_PREFIX";

const DEFAULT_QR_TTL_SECONDS =
  300;


async function resolveCounterStore(
  actorId
) {
  const normalizedActorId =
    String(
      actorId || ""
    ).trim();

  if (!normalizedActorId) {
    throw createSessionError({
      message:
        "Không xác định được tài khoản thu ngân",
      code:
        "CING_WALLET_POS_COUNTER_ACTOR_REQUIRED",
      statusCode:
        403,
    });
  }

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "cing_wallet_resolve_counter_store_v1",
      {
        p_actor_admin_id:
          normalizedActorId,
      }
    );

  if (error) {
    const errorMessage =
      String(
        error.message || ""
      );

    if (
      errorMessage.includes(
        "CING_WALLET_POS_COUNTER_STORE_NOT_CONFIGURED"
      )
    ) {
      throw createSessionError({
        message:
          "Tài khoản thu ngân chưa được gán cửa hàng Cing Wallet",
        code:
          "CING_WALLET_POS_COUNTER_STORE_NOT_CONFIGURED",
        statusCode:
          503,
      });
    }

    throw createSessionError({
      message:
        "Không thể xác định cửa hàng Cing Wallet",
      code:
        "CING_WALLET_POS_COUNTER_STORE_LOOKUP_FAILED",
      statusCode:
        500,
    });
  }

  const row =
    Array.isArray(data)
      ? data[0]
      : data;

  const storeId =
    String(
      row?.store_id || ""
    ).trim();

  const storeCode =
    String(
      row?.store_code || ""
    ).trim();

  const displayName =
    String(
      row?.display_name || ""
    ).trim();

  const posParent =
    String(
      row?.pos_parent || ""
    ).trim();

  const posId =
    String(
      row?.pos_id || ""
    ).trim();

  if (
    !storeId ||
    !storeCode ||
    !displayName ||
    !posParent ||
    !posId
  ) {
    throw createSessionError({
      message:
        "Cấu hình cửa hàng Cing Wallet không hợp lệ",
      code:
        "CING_WALLET_POS_COUNTER_STORE_INVALID",
      statusCode:
        500,
    });
  }

  return {
    storeId,
    storeCode,
    displayName,
    posParent,
    posId,
  };
}


const SESSION_STATUSES =
  new Set([
    "awaiting_amount",
    "amount_frozen",
    "qr_ready",
    "paid",
    "reconciliation_pending",
    "reconciled",
    "reconciliation_mismatch",
    "cancelled",
    "expired",
  ]);


function createSessionError({
  message,
  code,
  statusCode,
  cause,
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    statusCode;

  if (cause) {
    error.cause =
      cause;
  }

  return error;
}


function isPosCounterEnabled() {
  return (
    String(
      process.env[
        POS_COUNTER_ENABLED_ENV
      ] || ""
    )
      .trim()
      .toLowerCase() ===
    "true"
  );
}


function assertPosCounterEnabled() {
  if (!isPosCounterEnabled()) {
    throw createSessionError({
      message:
        "Cing Wallet POS Counter chưa được mở",
      code:
        "CING_WALLET_POS_COUNTER_DISABLED",
      statusCode:
        503,
    });
  }
}


function getConfiguredVoucherPrefix() {

  return String(

    process.env[

      POS_VOUCHER_PREFIX_ENV

    ] || ""

  )
    .trim()
    .toUpperCase();

}


function getConfiguredTriggerCode() {

  return String(

    process.env[

      POS_TRIGGER_CODE_ENV

    ] || ""

  )
    .trim()
    .toUpperCase();

}


function getConfiguredTriggerAuthority() {

  const voucherPrefix =
    getConfiguredVoucherPrefix();

  const triggerCode =
    getConfiguredTriggerCode();

  if (
    !/^[A-Z0-9]{2}$/.test(
      voucherPrefix
    )
  ) {

    throw createSessionError({

      message:
        "Cing Wallet POS voucher prefix chưa hợp lệ",

      code:
        "CING_WALLET_POS_VOUCHER_PREFIX_INVALID",

      statusCode:
        503,

    });

  }

  if (
    !/^[A-Z0-9]{10,64}$/.test(
      triggerCode
    )
  ) {

    throw createSessionError({

      message:
        "Cing Wallet POS trigger code chưa hợp lệ",

      code:
        "CING_WALLET_POS_TRIGGER_CODE_INVALID",

      statusCode:
        503,

    });

  }

  if (
    !triggerCode.startsWith(
      voucherPrefix
    )
  ) {

    throw createSessionError({

      message:
        "Cing Wallet POS trigger không thuộc voucher prefix",

      code:
        "CING_WALLET_POS_TRIGGER_PREFIX_MISMATCH",

      statusCode:
        503,

    });

  }

  return {

    voucherPrefix,

    triggerCode,

  };

}


function normalizeText(
  value,
  {
    code,
    message,
    maxLength = 256,
    optional = false,
  }
) {
  const normalized =
    String(
      value ?? ""
    ).trim();

  if (
    optional &&
    !normalized
  ) {
    return null;
  }

  if (
    !normalized ||
    normalized.length >
      maxLength
  ) {
    throw createSessionError({
      message,
      code,
      statusCode:
        400,
    });
  }

  return normalized;
}


function normalizeUuid(
  value,
  code =
    "CING_WALLET_POS_SESSION_ID_INVALID"
) {
  const normalized =
    String(
      value || ""
    ).trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(
        normalized
      )
  ) {
    throw createSessionError({
      message:
        "Mã phiên thanh toán không hợp lệ",
      code,
      statusCode:
        400,
    });
  }

  return normalized;
}


function firstRpcRow(
  data
) {
  return Array.isArray(
    data
  )
    ? data[0]
    : data;
}


function throwRpcError(
  error,
  fallbackCode
) {
  if (!error) {
    return;
  }

  const message =
    String(
      error.message || ""
    ) ||
    fallbackCode;

  let statusCode =
    500;

  if (
    error.code === "22023"
  ) {
    statusCode =
      400;
  } else if (
    error.code === "P0002"
  ) {
    statusCode =
      404;
  } else if (
    error.code === "55000" ||
    error.code === "23505"
  ) {
    statusCode =
      409;
  }

  throw createSessionError({
    message,
    code:
      message,
    statusCode,
    cause:
      error,
  });
}


function normalizeEvent2Request(
  body
) {
  const request =
    body?.voucher_request;

  if (
    !request ||
    typeof request !==
      "object" ||
    Array.isArray(
      request
    )
  ) {
    throw createSessionError({
      message:
        "Payload using_voucher không hợp lệ",
      code:
        "CING_WALLET_POS_EVENT2_BODY_INVALID",
      statusCode:
        400,
    });
  }

  const posParent =
    normalizeText(
      request.Pos_Parent,
      {
        code:
          "CING_WALLET_POS_EVENT2_PARENT_INVALID",
        message:
          "Pos_Parent không hợp lệ",
      }
    );

  const posId =
    normalizeText(
      request.Pos_Id,
      {
        code:
          "CING_WALLET_POS_EVENT2_POS_ID_INVALID",
        message:
          "Pos_Id không hợp lệ",
      }
    );

  const saleTranId =
    normalizeText(
      request.Sale_Tran_Id,
      {
        code:
          "CING_WALLET_POS_EVENT2_TRAN_ID_INVALID",
        message:
          "Sale_Tran_Id không hợp lệ",
      }
    );

  const couponCode =
    normalizeText(
      request.Coupon_Code,
      {
        code:
          "CING_WALLET_POS_EVENT2_COUPON_INVALID",
        message:
          "Coupon_Code không hợp lệ",
      }
    );

  const membershipId =
    normalizeText(
      request.Membership_Id,
      {
        code:
          "CING_WALLET_POS_EVENT2_MEMBER_INVALID",
        message:
          "Membership_Id không hợp lệ",
        optional:
          true,
      }
    );

  const lineItems =
    Array.isArray(
      request.Voucher_Order_Line
    )
      ? request.Voucher_Order_Line
      : [];

  return {
    request,
    posParent,
    posId,
    saleTranId,
    couponCode,
    membershipId,
    lineItems,
  };
}


function isCingWalletPosTriggerRequest(

  body

) {

  const event =

    String(

      body?.event || ""

    ).trim();

  const eventId =

    Number(

      body?.event_id

    );

  if (

    event !==
      "using_voucher" &&

    eventId !== 2

  ) {

    return false;

  }

  let authority;

  try {

    authority =
      getConfiguredTriggerAuthority();

  } catch {

    return false;

  }

  const requestCode =

    String(

      body
        ?.voucher_request
        ?.Coupon_Code ||
      ""

    )
      .trim()
      .toUpperCase();

  return (

    requestCode ===
    authority.triggerCode

  );

}

function buildEventFingerprint({
  posParent,
  posId,
  saleTranId,
  couponCode,
  request,
}) {
  const material =
    JSON.stringify({
      pos_parent:
        posParent,
      pos_id:
        posId,
      sale_tran_id:
        saleTranId,
      coupon_code:
        couponCode,
      created_at:
        request?.Created_At ||
        null,
      line_items:
        Array.isArray(
          request
            ?.Voucher_Order_Line
        )
          ? request
              .Voucher_Order_Line
          : [],
    });

  return crypto
    .createHash(
      "sha256"
    )
    .update(
      material,
      "utf8"
    )
    .digest(
      "hex"
    );
}


function formatIposTimestamp(
  date
) {
  const pad =
    value =>
      String(value)
        .padStart(
          2,
          "0"
        );

  return [
    date.getFullYear(),
    "-",
    pad(
      date.getMonth() + 1
    ),
    "-",
    pad(
      date.getDate()
    ),
    " ",
    pad(
      date.getHours()
    ),
    ":",
    pad(
      date.getMinutes()
    ),
    ":",
    pad(
      date.getSeconds()
    ),
  ].join("");
}


function buildUsingVoucherSuccessResponse(
  body
) {
  const request =
    body?.voucher_request ||
    {};

  const now =
    new Date();

  const end =
    new Date(
      now.getTime() +
      5 * 60 * 1000
    );

  return {
    event_id:
      2,

    event:
      "using_voucher",

    timestamp:
      String(
        body?.timestamp ||
        Date.now()
      ),

    voucher_request: {
      ...request,

      Membership_Id:
        request
          .Membership_Id ||
        "",

      Membership_Name:
        request
          .Membership_Name ||
        "Cing Wallet",

      Message:
        "Cing Wallet",

      Code:
        4,

      Is_Many_Times:
        0,

      Discount_Amount:
        0,

      Discount_Description:
        "Cing Wallet - kết nối thanh toán",

      Date_Start:
        formatIposTimestamp(
          now
        ),

      Date_End:
        formatIposTimestamp(
          end
        ),

      Is_Coupon:
        0,

      Only_Coupon:
        0,
    },
  };
}


function buildUsingVoucherFailureResponse(
  body,
  message =
    "Không thể kết nối Cing Wallet"
) {
  const request =
    body?.voucher_request ||
    {};

  const now =
    new Date();

  return {
    event_id:
      2,

    event:
      "using_voucher",

    timestamp:
      String(
        body?.timestamp ||
        Date.now()
      ),

    voucher_request: {
      ...request,

      Message:
        "Cing Wallet",

      Code:
        0,

      Is_Many_Times:
        0,

      Discount_Amount:
        0,

      Discount_Description:
        String(message)
          .slice(
            0,
            50
          ),

      Date_Start:
        formatIposTimestamp(
          now
        ),

      Date_End:
        formatIposTimestamp(
          now
        ),

      Is_Coupon:
        0,

      Only_Coupon:
        0,
    },
  };
}


async function handleIposUsingVoucher(
  body
) {
  assertPosCounterEnabled();

  if (
    !isCingWalletPosTriggerRequest(
      body
    )
  ) {
    throw createSessionError({
      message:
        "Không phải mã kích hoạt Cing Wallet POS",
      code:
        "CING_WALLET_POS_TRIGGER_MISMATCH",
      statusCode:
        400,
    });
  }

  const normalized =
    normalizeEvent2Request(
      body
    );

  const fingerprint =
    buildEventFingerprint(
      normalized
    );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "cing_wallet_upsert_pos_session_from_event2_v1",
      {
        p_pos_parent:
          normalized.posParent,

        p_pos_id:
          normalized.posId,

        p_sale_tran_id:
          normalized.saleTranId,

        p_membership_id:
          normalized.membershipId,

        p_coupon_code:
          normalized.couponCode,

        p_line_items:
          normalized.lineItems,

        p_event_payload:
          body,

        p_event_fingerprint:
          fingerprint,
      }
    );

  throwRpcError(
    error,
    "CING_WALLET_POS_EVENT2_SESSION_FAILED"
  );

  const session =
    firstRpcRow(
      data
    );

  if (
    !session?.session_id
  ) {
    throw createSessionError({
      message:
        "Không tạo được phiên thanh toán POS",
      code:
        "CING_WALLET_POS_EVENT2_SESSION_INVALID",
      statusCode:
        500,
    });
  }

  realtimeEventBus.publish({
    event:
      "wallet.pos.session.discovered",

    delivery_type:
      "BROADCAST",

    payload: {
      session_id:
        session.session_id,

      pos_parent:
        session.pos_parent,

      pos_id:
        session.pos_id,

      sale_tran_id:
        session.sale_tran_id,

      membership_id:
        session.membership_id,

      status:
        session.status,

      created:
        session.created ===
        true,
    },

    channel:
      "wallet",

    timestamp:
      new Date()
        .toISOString(),
  });

  return {
    response:
      buildUsingVoucherSuccessResponse(
        body
      ),

    session,
  };
}


async function getPosSessionById(
  sessionId
) {
  const normalizedId =
    normalizeUuid(
      sessionId
    );

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "cing_wallet_pos_sessions"
      )
      .select(
        [
          "id",
          "pos_parent",
          "pos_id",
          "sale_tran_id",
          "membership_id",
          "coupon_code",
          "line_items_snapshot",
          "amount",
          "amount_source",
          "amount_entered_by",
          "amount_entered_at",
          "amount_frozen_at",
          "payment_entry_mode",
          "payment_intent_id",
          "status",
          "last_event2_at",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .eq(
        "id",
        normalizedId
      )
      .maybeSingle();

  if (error) {
    throw createSessionError({
      message:
        error.message,
      code:
        "CING_WALLET_POS_SESSION_READ_FAILED",
      statusCode:
        500,
      cause:
        error,
    });
  }

  if (!data) {
    throw createSessionError({
      message:
        "Không tìm thấy phiên thanh toán",
      code:
        "CING_WALLET_POS_SESSION_NOT_FOUND",
      statusCode:
        404,
    });
  }

  return data;
}



async function recoverPosSessionQr(
  sessionId
) {
  assertPosCounterEnabled();
  assertPosEpaymentEnabled();

  const session =
    await getPosSessionById(
      sessionId
    );

  if (
    session.status !==
      "qr_ready"
  ) {
    throw createSessionError({
      message:
        "Phiên này không còn ở trạng thái chờ quét QR",
      code:
        "CING_WALLET_POS_QR_RECOVERY_STATUS_INVALID",
      statusCode:
        409,
    });
  }

  if (
    !session.payment_intent_id
  ) {
    throw createSessionError({
      message:
        "Phiên chưa có payment intent",
      code:
        "CING_WALLET_POS_QR_RECOVERY_INTENT_REQUIRED",
      statusCode:
        409,
    });
  }

  const {
    data: intent,
    error,
  } =
    await supabase
      .from(
        "cing_wallet_pos_payment_intents"
      )
      .select(
        [
          "id",
          "payment_token_id",
          "pos_parent",
          "pos_id",
          "bill_reference",
          "amount",
          "status",
          "expires_at",
          "paid_at",
        ].join(",")
      )
      .eq(
        "id",
        session.payment_intent_id
      )
      .maybeSingle();

  if (error) {
    throw createSessionError({
      message:
        error.message,
      code:
        "CING_WALLET_POS_QR_RECOVERY_READ_FAILED",
      statusCode:
        500,
      cause:
        error,
    });
  }

  if (!intent) {
    throw createSessionError({
      message:
        "Không tìm thấy payment intent",
      code:
        "CING_WALLET_POS_QR_RECOVERY_INTENT_NOT_FOUND",
      statusCode:
        404,
    });
  }

  if (
    intent.id !==
      session.payment_intent_id ||
    intent.pos_parent !==
      session.pos_parent ||
    intent.pos_id !==
      session.pos_id ||
    intent.bill_reference !==
      session.sale_tran_id ||
    Number(
      intent.amount
    ) !==
      Number(
        session.amount
      )
  ) {
    throw createSessionError({
      message:
        "Payment intent không khớp phiên POS",
      code:
        "CING_WALLET_POS_QR_RECOVERY_INTENT_MISMATCH",
      statusCode:
        409,
    });
  }

  if (
    intent.status !==
      "pending"
  ) {
    throw createSessionError({
      message:
        intent.status ===
          "paid"
          ? "Giao dịch đã được thanh toán"
          : "QR không còn khả dụng",
      code:
        "CING_WALLET_POS_QR_RECOVERY_NOT_PENDING",
      statusCode:
        409,
    });
  }

  const expiresAtMs =
    new Date(
      intent.expires_at
    ).getTime();

  if (
    !Number.isFinite(
      expiresAtMs
    ) ||
    expiresAtMs <=
      Date.now()
  ) {
    throw createSessionError({
      message:
        "QR thanh toán đã hết hạn",
      code:
        "CING_WALLET_POS_QR_RECOVERY_EXPIRED",
      statusCode:
        410,
    });
  }

  if (
    !intent.payment_token_id ||
    !intent.expires_at
  ) {
    throw createSessionError({
      message:
        "Payment intent thiếu dữ liệu QR",
      code:
        "CING_WALLET_POS_QR_RECOVERY_DATA_INVALID",
      statusCode:
        500,
    });
  }

  /*
   * Deterministic recovery only.
   *
   * NO create intent.
   * NO expiry extension.
   * NO Wallet mutation.
   *
   * Same token identity + same frozen expiry
   * => exact same signed capability semantics.
   */
  const qrContent =
    createQrCapability({
      paymentTokenId:
        intent.payment_token_id,

      expiresAt:
        intent.expires_at,
    });

  return {
    session_id:
      session.id,

    payment_intent_id:
      intent.id,

    sale_tran_id:
      session.sale_tran_id,

    amount:
      Number(
        intent.amount
      ),

    status:
      session.status,

    expires_at:
      intent.expires_at,

    qr_content:
      qrContent,
  };
}


async function listPosSessions({
  status,
  limit = 50,
}) {
  const normalizedLimit =
    Number(limit);

  if (
    !Number.isSafeInteger(
      normalizedLimit
    ) ||
    normalizedLimit < 1 ||
    normalizedLimit > 100
  ) {
    throw createSessionError({
      message:
        "Giới hạn danh sách không hợp lệ",
      code:
        "CING_WALLET_POS_SESSION_LIMIT_INVALID",
      statusCode:
        400,
    });
  }

  const normalizedStatus =
    status ===
      undefined ||
    status ===
      null ||
    status ===
      ""
      ? null
      : String(
          status
        ).trim();

  if (
    normalizedStatus &&
    !SESSION_STATUSES.has(
      normalizedStatus
    )
  ) {
    throw createSessionError({
      message:
        "Trạng thái phiên không hợp lệ",
      code:
        "CING_WALLET_POS_SESSION_STATUS_INVALID",
      statusCode:
        400,
    });
  }

  let query =
    supabase
      .from(
        "cing_wallet_pos_sessions"
      )
      .select(
        [
          "id",
          "pos_parent",
          "pos_id",
          "sale_tran_id",
          "membership_id",
          "line_items_snapshot",
          "amount",
          "amount_source",
          "payment_intent_id",
          "status",
          "last_event2_at",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      )
      .limit(
        normalizedLimit
      );

  if (
    normalizedStatus
  ) {
    query =
      query.eq(
        "status",
        normalizedStatus
      );
  }

  const {
    data,
    error,
  } =
    await query;

  if (error) {
    throw createSessionError({
      message:
        error.message,
      code:
        "CING_WALLET_POS_SESSION_LIST_FAILED",
      statusCode:
        500,
      cause:
        error,
    });
  }

  return Array.isArray(
    data
  )
    ? data
    : [];
}




async function getCurrentManualPosSession({
  actorId,
}) {
  assertPosCounterEnabled();

  const normalizedActorId =
    String(
      actorId || ""
    ).trim();

  if (!normalizedActorId) {
    throw createSessionError({
      message:
        "Không xác định được tài khoản thu ngân",
      code:
        "CING_WALLET_POS_COUNTER_ACTOR_REQUIRED",
      statusCode:
        403,
    });
  }

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "cing_wallet_get_current_manual_pos_session_v1",
      {
        p_actor_admin_id:
          normalizedActorId,
      }
    );

  if (error) {
    const errorMessage =
      String(
        error.message || ""
      );

    if (
      errorMessage.includes(
        "CING_WALLET_POS_COUNTER_STORE_NOT_CONFIGURED"
      )
    ) {
      throw createSessionError({
        message:
          "Tài khoản thu ngân chưa được gán cửa hàng Cing Wallet",
        code:
          "CING_WALLET_POS_COUNTER_STORE_NOT_CONFIGURED",
        statusCode:
          503,
      });
    }

    if (
      errorMessage.includes(
        "CING_WALLET_POS_COUNTER_ACTOR_REQUIRED"
      )
    ) {
      throw createSessionError({
        message:
          "Không xác định được tài khoản thu ngân",
        code:
          "CING_WALLET_POS_COUNTER_ACTOR_REQUIRED",
        statusCode:
          403,
      });
    }

    throw createSessionError({
      message:
        "Không thể đọc phiên Cing Wallet hiện tại",
      code:
        "CING_WALLET_POS_CURRENT_MANUAL_SESSION_READ_FAILED",
      statusCode:
        500,
    });
  }

  const row =
    Array.isArray(data)
      ? data[0]
      : data;

  return row || null;
}


async function prepareManualPosPaymentQr({
  amount,
  actorId,
  requestId,
}) {
  assertPosCounterEnabled();
  assertPosEpaymentEnabled();

  const normalizedAmount =
    normalizeAmount(
      amount
    );

  const normalizedActorId =
    normalizeText(
      actorId,
      {
        code:
          "CING_WALLET_POS_COUNTER_ACTOR_INVALID",
        message:
          "Không xác định được thu ngân",
        maxLength:
          512,
      }
    );

  const normalizedRequestId =
    normalizeUuid(
      requestId
    );

  const expiresAt =
    new Date(
      Date.now() +
      DEFAULT_QR_TTL_SECONDS *
        1000
    ).toISOString();

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "cing_wallet_prepare_manual_pos_payment_v3",
      {
        p_amount:
          normalizedAmount,
        p_actor_admin_id:
          normalizedActorId,
        p_request_id:
          normalizedRequestId,
        p_expires_at:
          expiresAt,
        }
    );

  throwRpcError(
    error,
    "CING_WALLET_POS_MANUAL_PAYMENT_PREPARE_FAILED"
  );

  const prepared =
    firstRpcRow(
      data
    );

  if (
    !prepared?.session_id ||
    !prepared
      ?.payment_intent_id ||
    !prepared
      ?.payment_token_id ||
    !prepared?.expires_at
  ) {
    throw createSessionError({
      message:
        "Không tạo được QR Cing Wallet",
      code:
        "CING_WALLET_POS_MANUAL_PAYMENT_PREPARE_INVALID",
      statusCode:
        500,
    });
  }

  if (
    prepared.sale_tran_id !==
      null &&
    prepared.sale_tran_id !==
      undefined
  ) {
    throw createSessionError({
      message:
        "Phiên manual đã có bill iPOS ngoài dự kiến",
      code:
        "CING_WALLET_POS_MANUAL_PREBILL_IDENTITY_CONFLICT",
      statusCode:
        409,
    });
  }

  if (
    Number(
      prepared.amount
    ) !==
      normalizedAmount ||
    prepared.amount_source !==
      "cashier_manual"
  ) {
    throw createSessionError({
      message:
        "Số tiền QR không khớp số tiền thu ngân nhập",
      code:
        "CING_WALLET_POS_MANUAL_AMOUNT_MISMATCH",
      statusCode:
        409,
    });
  }

  if (
    prepared.session_status !==
      "qr_ready" ||
    prepared.payment_status !==
      "pending"
  ) {
    throw createSessionError({
      message:
        "Phiên thanh toán không ở trạng thái sẵn sàng",
      code:
        "CING_WALLET_POS_MANUAL_STATE_INVALID",
      statusCode:
        409,
    });
  }

  const qrContent =
    createQrCapability({
      paymentTokenId:
        prepared
          .payment_token_id,
      expiresAt:
        prepared.expires_at,
    });

  realtimeEventBus.publish({
    event:
      "wallet.pos.qr.ready",
    delivery_type:
      "BROADCAST",
    payload: {
      session_id:
        prepared.session_id,
      sale_tran_id:
        null,
      amount:
        normalizedAmount,
      status:
        "qr_ready",
      expires_at:
        prepared.expires_at,
    },
    channel:
      "wallet",
    timestamp:
      new Date()
        .toISOString(),
  });

  return {
    session_id:
      prepared.session_id,
    payment_intent_id:
      prepared
        .payment_intent_id,
    sale_tran_id:
      null,
    store_id:
      prepared.store_id,
    store_code:
      prepared.store_code,
    store_display_name:
      prepared.store_display_name,
    pos_parent:
      prepared.pos_parent,
    pos_id:
      prepared.pos_id,
    amount:
      normalizedAmount,
    amount_source:
      "cashier_manual",
    status:
      "qr_ready",
    expires_at:
      prepared.expires_at,
    qr_content:
      qrContent,
    created:
      prepared.created_session ===
      true,
  };
}

async function freezeAmountAndCreateQr({
  sessionId,
  amount,
  actorId,
}) {
  assertPosCounterEnabled();
  assertPosEpaymentEnabled();

  const normalizedSessionId =
    normalizeUuid(
      sessionId
    );

  const normalizedAmount =
    normalizeAmount(
      amount
    );

  const normalizedActorId =
    normalizeText(
      actorId,
      {
        code:
          "CING_WALLET_POS_COUNTER_ACTOR_INVALID",
        message:
          "Không xác định được thu ngân",
        maxLength:
          512,
      }
    );

  const {
    data: freezeData,
    error: freezeError,
  } =
    await supabase.rpc(
      "cing_wallet_freeze_pos_session_amount_v1",
      {
        p_session_id:
          normalizedSessionId,

        p_amount:
          normalizedAmount,

        p_amount_source:
          "cashier_manual",

        p_actor_id:
          normalizedActorId,
      }
    );

  throwRpcError(
    freezeError,
    "CING_WALLET_POS_AMOUNT_FREEZE_FAILED"
  );

  const frozen =
    firstRpcRow(
      freezeData
    );

  if (
    !frozen?.session_id
  ) {
    throw createSessionError({
      message:
        "Không freeze được số tiền thanh toán",
      code:
        "CING_WALLET_POS_AMOUNT_FREEZE_INVALID",
      statusCode:
        500,
    });
  }

  const session =
    await getPosSessionById(
      normalizedSessionId
    );

  if (
    Number(
      session.amount
    ) !==
      normalizedAmount ||
    session.amount_source !==
      "cashier_manual"
  ) {
    throw createSessionError({
      message:
        "Số tiền phiên thanh toán không khớp",
      code:
        "CING_WALLET_POS_FROZEN_AMOUNT_MISMATCH",
      statusCode:
        409,
    });
  }

  const payment =
    await createIposPosPayment({
      transactionId:
        session.sale_tran_id,

      posParent:
        session.pos_parent,

      posId:
        session.pos_id,

      billReference:
        session.sale_tran_id,

      amount:
        normalizedAmount,

      ttlSeconds:
        DEFAULT_QR_TTL_SECONDS,
    });

  const {
    data: linkData,
    error: linkError,
  } =
    await supabase.rpc(
      "cing_wallet_link_pos_session_payment_intent_v1",
      {
        p_session_id:
          normalizedSessionId,

        p_payment_intent_id:
          payment.intent_id,
      }
    );

  throwRpcError(
    linkError,
    "CING_WALLET_POS_INTENT_LINK_FAILED"
  );

  const linked =
    firstRpcRow(
      linkData
    );

  if (
    !linked
      ?.payment_intent_id
  ) {
    throw createSessionError({
      message:
        "Không liên kết được QR với phiên POS",
      code:
        "CING_WALLET_POS_INTENT_LINK_INVALID",
      statusCode:
        500,
    });
  }

  realtimeEventBus.publish({
    event:
      "wallet.pos.qr.ready",

    delivery_type:
      "BROADCAST",

    payload: {
      session_id:
        normalizedSessionId,

      sale_tran_id:
        session.sale_tran_id,

      amount:
        normalizedAmount,

      status:
        "qr_ready",

      expires_at:
        payment.expires_at,
    },

    channel:
      "wallet",

    timestamp:
      new Date()
        .toISOString(),
  });

  return {
    session_id:
      normalizedSessionId,

    sale_tran_id:
      session.sale_tran_id,

    pos_parent:
      session.pos_parent,

    pos_id:
      session.pos_id,

    amount:
      normalizedAmount,

    amount_source:
      "cashier_manual",

    status:
      "qr_ready",

    intent_id:
      payment.intent_id,

    expires_at:
      payment.expires_at,

    qr_content:
      payment.qr_content,
  };
}



function extractEvent11Data(
  body
) {
  const sale =
    body?.sale_manager;

  if (
    !sale ||
    typeof sale !==
      "object" ||
    Array.isArray(
      sale
    )
  ) {
    throw createSessionError({
      message:
        "Payload sale_manager không hợp lệ",
      code:
        "CING_WALLET_POS_EVENT11_BODY_INVALID",
      statusCode:
        400,
    });
  }

  const posParent =
    normalizeText(
      sale.pos_parent ??
      sale.Pos_Parent,
      {
        code:
          "CING_WALLET_POS_EVENT11_PARENT_INVALID",
        message:
          "Event 11 thiếu pos_parent",
      }
    );

  const posId =
    normalizeText(
      sale.pos_id ??
      sale.Pos_Id,
      {
        code:
          "CING_WALLET_POS_EVENT11_POS_ID_INVALID",
        message:
          "Event 11 thiếu pos_id",
      }
    );

  const saleTranId =
    normalizeText(
      sale.tran_id ??
      sale.Tran_Id ??
      sale.sale_tran_id ??
      sale.Sale_Tran_Id,
      {
        code:
          "CING_WALLET_POS_EVENT11_TRAN_ID_INVALID",
        message:
          "Event 11 thiếu tran_id",
      }
    );

  const rawTotal =
    sale.total_amount ??
    sale.Total_Amount;

  const finalTotal =
    Number(
      rawTotal
    );

  if (
    !Number.isSafeInteger(
      finalTotal
    ) ||
    finalTotal < 0
  ) {
    throw createSessionError({
      message:
        "Event 11 total_amount không hợp lệ",
      code:
        "CING_WALLET_POS_EVENT11_TOTAL_INVALID",
      statusCode:
        400,
    });
  }

  const rawPayments =
    sale.payment_info ??
    sale.Payment_Info ??
    [];

  const payments =
    Array.isArray(
      rawPayments
    )
      ? rawPayments
      : rawPayments &&
        typeof rawPayments ===
          "object"
        ? [rawPayments]
        : [];

  const walletPayment =
    payments.find(
      payment => {
        const method =
          String(
            payment?.method_id ??
            payment?.Method_Id ??
            payment?.name ??
            payment?.Name ??
            ""
          )
            .trim()
            .toUpperCase();

        return (
          method ===
            "CING_WALLET" ||
          method ===
            "CING WALLET"
        );
      }
    ) ||
    null;

  const paymentMethod =
    walletPayment
      ? "CING_WALLET"
      : null;

  const traceNo =
    walletPayment
      ? String(
          walletPayment
            .trace_no ??
          walletPayment
            .Trace_No ??
          ""
        ).trim() || null
      : null;

  const fingerprint =
    crypto
      .createHash(
        "sha256"
      )
      .update(
        JSON.stringify({
          pos_parent:
            posParent,
          pos_id:
            posId,
          sale_tran_id:
            saleTranId,
          total_amount:
            finalTotal,
          payment_method:
            paymentMethod,
          trace_no:
            traceNo,
        }),
        "utf8"
      )
      .digest(
        "hex"
      );

  return {
    sale,
    posParent,
    posId,
    saleTranId,
    finalTotal,
    paymentMethod,
    traceNo,
    fingerprint,
  };
}


async function projectPaidPaymentToPosSession({
  paymentIntentId,
}) {
  const normalizedIntentId =
    normalizeUuid(
      paymentIntentId,
      "CING_WALLET_POS_RECON_INTENT_INVALID"
    );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "cing_wallet_project_pos_session_paid_v1",
      {
        p_payment_intent_id:
          normalizedIntentId,
      }
    );

  throwRpcError(
    error,
    "CING_WALLET_POS_PAID_PROJECTION_FAILED"
  );

  const projected =
    firstRpcRow(
      data
    );

  if (!projected) {
    throw createSessionError({
      message:
        "Không nhận được kết quả POS paid projection",
      code:
        "CING_WALLET_POS_PAID_PROJECTION_INVALID",
      statusCode:
        500,
    });
  }

  if (
    projected.projected ===
      true &&
    projected.session_id
  ) {
    realtimeEventBus.publish({
      event:
        "wallet.pos.payment.paid",

      delivery_type:
        "BROADCAST",

      payload: {
        session_id:
          projected.session_id,

        payment_intent_id:
          normalizedIntentId,

        amount:
          Number(
            projected.amount
          ),

        status:
          projected.status,

        wallet_transaction_id:
          projected.wallet_transaction_id,

        paid_at:
          projected.paid_at,
      },

      channel:
        "wallet",

      timestamp:
        new Date()
          .toISOString(),
    });
  }

  return projected;
}


async function reconcileIposEvent11(
  body
) {
  const normalized =
    extractEvent11Data(
      body
    );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "cing_wallet_reconcile_pos_event11_v2",
      {
        p_pos_parent:
          normalized.posParent,

        p_pos_id:
          normalized.posId,

        p_sale_tran_id:
          normalized.saleTranId,

        p_final_total:
          normalized.finalTotal,

        p_payment_method:
          normalized.paymentMethod,

        p_trace_no:
          normalized.traceNo,

        p_event_payload:
          body,

        p_event_fingerprint:
          normalized.fingerprint,
      }
    );

  throwRpcError(
    error,
    "CING_WALLET_POS_EVENT11_RECON_FAILED"
  );

  const result =
    firstRpcRow(
      data
    );

  if (
    !result ||
    result.found_session !==
      true
  ) {
    return {
      found_session:
        false,
    };
  }

  const matched =
    result
      .reconciliation_status ===
    "matched";

  realtimeEventBus.publish({
    event:
      matched
        ? "wallet.pos.reconciliation.matched"
        : "wallet.pos.reconciliation.alert",

    delivery_type:
      "BROADCAST",

    payload: {
      session_id:
        result.session_id,

      reconciliation_status:
        result.reconciliation_status,

      expected_amount:
        Number(
          result.expected_amount
        ),

      actual_amount:
        Number(
          result.actual_amount
        ),

      difference_amount:
        Number(
          result.difference_amount
        ),

      alert_created:
        result.alert_created ===
        true,

      state_repaired:
        result.state_repaired ===
        true,
    },

    channel:
      "wallet",

    timestamp:
      new Date()
        .toISOString(),
  });

  return result;
}


async function resolvePosReconciliation({
  alertId,
  requestId,
  resolutionAction,
  reasonCode,
  note = null,
  actorId,
}) {
  const normalizedAlertId =
    String(
      alertId || ""
    ).trim();

  const normalizedRequestId =
    String(
      requestId || ""
    ).trim();

  const normalizedAction =
    String(
      resolutionAction || ""
    )
      .trim()
      .toLowerCase();

  const normalizedReasonCode =
    String(
      reasonCode || ""
    )
      .trim()
      .toLowerCase();

  const normalizedActorId =
    String(
      actorId || ""
    ).trim();

  const normalizedNote =
    note === null ||
    note === undefined
      ? null
      : String(
          note
        ).trim();

  if (!normalizedAlertId) {
    throw createSessionError({
      message:
        "Thiếu mã cảnh báo đối soát",
      code:
        "CING_WALLET_POS_RESOLUTION_ALERT_ID_REQUIRED",
      statusCode:
        400,
    });
  }

  if (!normalizedRequestId) {
    throw createSessionError({
      message:
        "Thiếu request_id xử lý đối soát",
      code:
        "CING_WALLET_POS_RESOLUTION_REQUEST_ID_REQUIRED",
      statusCode:
        400,
    });
  }

  if (!normalizedActorId) {
    throw createSessionError({
      message:
        "Không xác định được Super Admin",
      code:
        "CING_WALLET_POS_RESOLUTION_ACTOR_REQUIRED",
      statusCode:
        403,
    });
  }

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "cing_wallet_resolve_pos_reconciliation_v1",
      {
        p_alert_id:
          normalizedAlertId,
        p_request_id:
          normalizedRequestId,
        p_resolution_action:
          normalizedAction,
        p_reason_code:
          normalizedReasonCode,
        p_note:
          normalizedNote,
        p_actor_id:
          normalizedActorId,
      }
    );

  if (error) {
    const message =
      String(
        error.message || ""
      );

    if (
      message.includes(
        "CING_WALLET_POS_RESOLUTION_ALERT_NOT_FOUND"
      )
    ) {
      throw createSessionError({
        message:
          "Không tìm thấy cảnh báo đối soát",
        code:
          "CING_WALLET_POS_RESOLUTION_ALERT_NOT_FOUND",
        statusCode:
          404,
        cause:
          error,
      });
    }

    if (
      message.includes(
        "CING_WALLET_POS_RESOLUTION_ACTOR_REQUIRED"
      )
    ) {
      throw createSessionError({
        message:
          "Không xác định được Super Admin",
        code:
          "CING_WALLET_POS_RESOLUTION_ACTOR_REQUIRED",
        statusCode:
          403,
        cause:
          error,
      });
    }

    const badRequestCodes = [
      "CING_WALLET_POS_RESOLUTION_ALERT_ID_REQUIRED",
      "CING_WALLET_POS_RESOLUTION_REQUEST_ID_REQUIRED",
      "CING_WALLET_POS_RESOLUTION_ACTION_INVALID",
      "CING_WALLET_POS_RESOLUTION_REASON_INVALID",
      "CING_WALLET_POS_RESOLUTION_NOTE_INVALID",
      "CING_WALLET_POS_RESOLUTION_NOTE_REQUIRED",
    ];

    const badRequestCode =
      badRequestCodes.find(
        code =>
          message.includes(
            code
          )
      );

    if (badRequestCode) {
      throw createSessionError({
        message:
          "Dữ liệu xử lý đối soát không hợp lệ",
        code:
          badRequestCode,
        statusCode:
          400,
        cause:
          error,
      });
    }

    const conflictCodes = [
      "CING_WALLET_POS_RESOLUTION_REPLAY_CONFLICT",
      "CING_WALLET_POS_RESOLUTION_ALERT_NOT_OPEN",
      "CING_WALLET_POS_RESOLUTION_ALERT_STATE_CONFLICT",
      "CING_WALLET_POS_RESOLUTION_SESSION_NOT_FOUND",
      "CING_WALLET_POS_RESOLUTION_SESSION_CONFLICT",
      "CING_WALLET_POS_RESOLUTION_EVIDENCE_CONFLICT",
      "CING_WALLET_POS_RESOLUTION_FINANCIAL_ALERT_TYPE_INVALID",
      "CING_WALLET_POS_RESOLUTION_PAID_PROOF_REQUIRED",
      "CING_WALLET_POS_RESOLUTION_INTENT_CONFLICT",
      "CING_WALLET_POS_RESOLUTION_ORIGINAL_AMOUNT_CONFLICT",
      "CING_WALLET_POS_RESOLUTION_DIFFERENCE_INVALID",
      "CING_WALLET_POS_RESOLUTION_DIRECTION_CONFLICT",
      "CING_WALLET_INSUFFICIENT_BALANCE",
    ];

    const conflictCode =
      conflictCodes.find(
        code =>
          message.includes(
            code
          )
      );

    if (conflictCode) {
      throw createSessionError({
        message:
          "Không thể áp dụng quyết định đối soát ở trạng thái hiện tại",
        code:
          conflictCode,
        statusCode:
          409,
        cause:
          error,
      });
    }

    throw createSessionError({
      message:
        error.message ||
        "Không thể xử lý cảnh báo đối soát",
      code:
        "CING_WALLET_POS_RESOLUTION_FAILED",
      statusCode:
        500,
      cause:
        error,
    });
  }

  const row =
    Array.isArray(
      data
    )
      ? data[0]
      : data;

  if (
    !row ||
    typeof row !==
      "object" ||
    !row.resolution_id ||
    !row.alert_id ||
    !row.session_id ||
    typeof row.resolution_action !==
      "string" ||
    ![
      "open",
      "resolved",
    ].includes(
      row.alert_status
    ) ||
    typeof row.applied !==
      "boolean"
  ) {
    throw createSessionError({
      message:
        "Kết quả xử lý đối soát không hợp lệ",
      code:
        "CING_WALLET_POS_RESOLUTION_RESULT_INVALID",
      statusCode:
        500,
    });
  }

  return row;
}


async function listPosReconciliationAlerts({
  status = "open",
  limit = 100,
  storeId = null,
}) {
  const normalizedStatus =
    String(
      status || "open"
    ).trim();

  if (
    ![
      "open",
      "resolved",
    ].includes(
      normalizedStatus
    )
  ) {
    throw createSessionError({
      message:
        "Trạng thái cảnh báo không hợp lệ",
      code:
        "CING_WALLET_POS_ALERT_STATUS_INVALID",
      statusCode:
        400,
    });
  }

  const normalizedLimit =
    Number(
      limit
    );

  if (
    !Number.isSafeInteger(
      normalizedLimit
    ) ||
    normalizedLimit < 1 ||
    normalizedLimit > 200
  ) {
    throw createSessionError({
      message:
        "Giới hạn cảnh báo không hợp lệ",
      code:
        "CING_WALLET_POS_ALERT_LIMIT_INVALID",
      statusCode:
        400,
    });
  }

  const normalizedStoreId =
    storeId === undefined ||
    storeId === null ||
    storeId === ""
      ? null
      : normalizeUuid(
          storeId,
          "CING_WALLET_POS_ALERT_STORE_ID_INVALID"
        );

  const {
    data,
    error,
  } =
    await supabase.rpc(
      "cing_wallet_list_pos_reconciliation_alerts_v2",
      {
        p_status:
          normalizedStatus,
        p_limit:
          normalizedLimit,
        p_store_id:
          normalizedStoreId,
      }
    );

  if (error) {
    const errorMessage =
      String(
        error.message || ""
      );

    if (
      errorMessage.includes(
        "CING_WALLET_POS_ALERT_STATUS_INVALID"
      )
    ) {
      throw createSessionError({
        message:
          "Trạng thái cảnh báo không hợp lệ",
        code:
          "CING_WALLET_POS_ALERT_STATUS_INVALID",
        statusCode:
          400,
      });
    }

    if (
      errorMessage.includes(
        "CING_WALLET_POS_ALERT_LIMIT_INVALID"
      )
    ) {
      throw createSessionError({
        message:
          "Giới hạn cảnh báo không hợp lệ",
        code:
          "CING_WALLET_POS_ALERT_LIMIT_INVALID",
        statusCode:
          400,
      });
    }

    throw createSessionError({
      message:
        error.message,
      code:
        "CING_WALLET_POS_ALERT_LIST_FAILED",
      statusCode:
        500,
      cause:
        error,
    });
  }

  return Array.isArray(
    data
  )
    ? data
    : [];
}


module.exports = {
  resolveCounterStore,
  POS_COUNTER_ENABLED_ENV,
  POS_TRIGGER_CODE_ENV,
  DEFAULT_QR_TTL_SECONDS,
  createSessionError,
  isPosCounterEnabled,
  assertPosCounterEnabled,
  getConfiguredTriggerCode,
  isCingWalletPosTriggerRequest,
  normalizeEvent2Request,
  buildEventFingerprint,
  buildUsingVoucherSuccessResponse,
  buildUsingVoucherFailureResponse,
  handleIposUsingVoucher,
  getPosSessionById,
  recoverPosSessionQr,
  listPosSessions,
  getCurrentManualPosSession,
  prepareManualPosPaymentQr,
  freezeAmountAndCreateQr,
  extractEvent11Data,
  projectPaidPaymentToPosSession,
  reconcileIposEvent11,
  resolvePosReconciliation,

  listPosReconciliationAlerts,
};

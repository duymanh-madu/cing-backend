const supabase =
  require("../supabase");

const logger =
  require("./loggerService");

const {

  processRealtimeEvent,

} = require(
  "./realtime/realtimeEventPipeline"
);

const {

  VOUCHER_EVENTS,

  MEMBER_EVENTS,

} = require(
  "./realtime/realtimeEventTypes"
);

/**
 * =====================================================
 * VALIDATE VOUCHER
 * =====================================================
 */

async function validateVoucher({

  user_id,

  voucher_code,

  subtotal = 0,

}) {

  /**
   * ============================================
   * VALIDATION
   * ============================================
   */

  if (!voucher_code) {

    return {

      success: false,

      message:
        "Thiếu mã voucher",

    };

  }

  /**
   * ============================================
   * FETCH USER VOUCHER
   * ============================================
   */

  const {

    data: voucher,

    error,

  } = await supabase

    .from("user_vouchers")

    .select("*")

    .eq(
      "user_id",
      user_id
    )

    .eq(
      "voucher_code",
      voucher_code
    )

    .maybeSingle();

  /**
   * ============================================
   * DATABASE ERROR
   * ============================================
   */

  if (error) {

    logger.error(

      "Validate voucher failed",

      {

        error:
          error.message,

        voucher_code,

        user_id,

      }

    );

    throw new Error(
      error.message
    );

  }

  /**
   * ============================================
   * NOT FOUND
   * ============================================
   */

  if (!voucher) {

    return {

      success: false,

      message:
        "Voucher không tồn tại",

    };

  }

  /**
   * ============================================
   * STATUS VALIDATION
   * ============================================
   */

  if (

    voucher.voucher_status !==
    "available"

  ) {

    return {

      success: false,

      message:
        "Voucher không khả dụng",

    };

  }

  /**
   * ============================================
   * EXPIRED VALIDATION
   * ============================================
   */

  if (

    voucher.expires_at &&

    new Date(
      voucher.expires_at
    ) < new Date()

  ) {

    return {

      success: false,

      message:
        "Voucher đã hết hạn",

    };

  }

  /**
   * ============================================
   * CALCULATE DISCOUNT
   * ============================================
   */

  let discount_amount = 0;

  if (

    voucher.discount_type ===
    "fixed"

  ) {

    discount_amount =
      Number(
        voucher.discount_value || 0
      );

  } else {

    discount_amount =

      subtotal *

      (
        Number(
          voucher.discount_value || 0
        ) / 100
      );

  }

  /**
   * ============================================
   * SUCCESS LOG
   * ============================================
   */

  logger.info(

    "Voucher validated",

    {

      voucher_code,

      user_id,

      discount_amount,

    }

  );

  /**
   * ============================================
   * RESPONSE
   * ============================================
   */

  return {

    success: true,

    voucher,

    discount_amount,

    user_voucher:
      voucher,

  };

}

/**
 * =====================================================
 * CLAIM VOUCHER
 * =====================================================
 */

async function claimVoucher({

  user_id,

  voucher,

}) {

  /**
   * ============================================
   * VALIDATION
   * ============================================
   */

  if (!user_id) {

    throw new Error(
      "Missing user_id"
    );

  }

  if (!voucher) {

    throw new Error(
      "Missing voucher"
    );

  }

  /**
   * ============================================
   * CREATE USER VOUCHER
   * ============================================
   */

  const {

    data,

    error,

  } = await supabase

    .from("user_vouchers")

    .insert({

      user_id,

      voucher_id:
        voucher.id,

      voucher_code:
        voucher.voucher_code,

      voucher_name:
        voucher.voucher_name,

      discount_type:
        voucher.discount_type,

      discount_value:
        voucher.discount_value,

      expires_at:
        voucher.expires_at,

      voucher_status:
        "available",

      created_at:
        new Date(),

      updated_at:
        new Date(),

    })

    .select("*")

    .maybeSingle();

  /**
   * ============================================
   * DATABASE ERROR
   * ============================================
   */

  if (error) {

    logger.error(

      "Claim voucher failed",

      {

        error:
          error.message,

        user_id,

      }

    );

    throw new Error(
      error.message
    );

  }

  /**
   * ============================================
   * REALTIME MEMBER EVENT
   * ============================================
   */

  processRealtimeEvent({

    type:
      "member",

    target:
      user_id,

    event:
      MEMBER_EVENTS.VOUCHER_RECEIVED,

    payload: {

      voucher:
        data,

    },

  });

  /**
   * ============================================
   * GLOBAL VOUCHER EVENT
   * ============================================
   */

  processRealtimeEvent({

    type:
      "voucher",

    event:
      VOUCHER_EVENTS.VOUCHER_CREATED,

    payload: {

      voucher:
        data,

    },

  });

  /**
   * ============================================
   * SUCCESS LOG
   * ============================================
   */

  logger.info(

    "Voucher claimed",

    {

      user_id,

      voucher_code:
        data?.voucher_code,

    }

  );

  /**
   * ============================================
   * RESPONSE
   * ============================================
   */

  return {

    success: true,

    voucher:
      data,

  };

}

/**
 * =====================================================
 * USE VOUCHER
 * =====================================================
 */

async function useVoucher({

  user_voucher_id,

  order_id,

  order_code,

  discount_amount = 0,

}) {

  /**
   * ============================================
   * UPDATE USER VOUCHER
   * ============================================
   */

  const {

    data,

    error,

  } = await supabase

    .from("user_vouchers")

    .update({

      voucher_status:
        "used",

      used_at:
        new Date(),

      used_order_id:
        order_id,

      used_order_code:
        order_code,

      discount_amount,

      updated_at:
        new Date(),

    })

    .eq(
      "id",
      user_voucher_id
    )

    .select("*")

    .maybeSingle();

  /**
   * ============================================
   * DATABASE ERROR
   * ============================================
   */

  if (error) {

    logger.error(

      "Use voucher failed",

      {

        error:
          error.message,

        user_voucher_id,

      }

    );

    throw new Error(
      error.message
    );

  }

  /**
   * ============================================
   * SUCCESS LOG
   * ============================================
   */

  logger.info(

    "Voucher used",

    {

      user_voucher_id,

      order_id,

      order_code,

      discount_amount,

    }

  );

  /**
   * ============================================
   * RESPONSE
   * ============================================
   */

  return {

    success: true,

    voucher:
      data,

  };

}

/**
 * =====================================================
 * GET USER VOUCHERS
 * =====================================================
 */

async function getUserVouchers({

  user_id,

  tab = "available",

}) {

  /**
   * ============================================
   * BASE QUERY
   * ============================================
   */

  let query =
    supabase

      .from("user_vouchers")

      .select("*")

      .eq(
        "user_id",
        user_id
      );

  /**
   * ============================================
   * AVAILABLE TAB
   * ============================================
   */

  if (tab === "available") {

    query =
      query.eq(
        "voucher_status",
        "available"
      );

  }

  /**
   * ============================================
   * HISTORY TAB
   * ============================================
   */

  if (tab === "history") {

    query =
      query.in(
        "voucher_status",

        [
          "used",
          "expired",
        ]

      );

  }

  /**
   * ============================================
   * FETCH
   * ============================================
   */

  const {

    data,

    error,

  } = await query.order(
    "created_at",
    {
      ascending: false,
    }
  );

  /**
   * ============================================
   * DATABASE ERROR
   * ============================================
   */

  if (error) {

    logger.error(

      "Get user vouchers failed",

      {

        error:
          error.message,

        user_id,

      }

    );

    throw new Error(
      error.message
    );

  }

  /**
   * ============================================
   * RESPONSE
   * ============================================
   */

  return {

    success: true,

    vouchers:
      data || [],

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  validateVoucher,

  claimVoucher,

  useVoucher,

  getUserVouchers,

};
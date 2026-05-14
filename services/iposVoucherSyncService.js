const axios =
  require("axios");

const supabase =
  require("../supabase");

/**
 * =====================================================
 * ENV
 * =====================================================
 */

const IPOS_BASE_URL =
  process.env.IPOS_BASE_URL;

const IPOS_ACCESS_TOKEN =
  process.env.IPOS_ACCESS_TOKEN;

const IPOS_POS_PARENT =
  process.env.IPOS_POS_PARENT;

const IPOS_POS_ID =
  process.env.IPOS_POS_ID;

/**
 * =====================================================
 * AXIOS INSTANCE
 * =====================================================
 */

const iposClient =
  axios.create({

    baseURL:
      IPOS_BASE_URL,

    timeout:
      15000,

    headers: {

      Authorization:

        `Bearer ${IPOS_ACCESS_TOKEN}`,

      "Content-Type":
        "application/json",

    },

  });

/**
 * =====================================================
 * VALIDATE VOUCHER
 * =====================================================
 */

function validateVoucherPayload(
  voucher
) {

  if (!voucher) {

    throw new Error(
      "Voucher is required"
    );

  }

  if (
    !voucher.voucher_code
  ) {

    throw new Error(
      "voucher_code is required"
    );

  }

  if (
    !voucher.voucher_name
  ) {

    throw new Error(
      "voucher_name is required"
    );

  }

  if (
    !voucher.voucher_type
  ) {

    throw new Error(
      "voucher_type is required"
    );

  }

}

/**
 * =====================================================
 * CREATE PAYLOAD
 * =====================================================
 */

function buildVoucherPayload(
  voucher
) {

  return {

    voucher_code:
      voucher.voucher_code,

    voucher_name:
      voucher.voucher_name,

    voucher_type:
      voucher.voucher_type,

    discount_value:
      Number(
        voucher.discount_value || 0
      ),

    minimum_order_value:

      Number(

        voucher.minimum_order_value ||
        0

      ),

    max_discount_amount:

      Number(

        voucher.max_discount_amount ||
        0

      ),

    expired_at:
      voucher.expired_at,

    voucher_status:
      voucher.voucher_status,

    pos_parent:
      IPOS_POS_PARENT,

    pos_id:
      IPOS_POS_ID,

  };

}

/**
 * =====================================================
 * LOG SYNC
 * =====================================================
 */

async function createVoucherSyncLog({

  voucher_id,

  sync_type,

  sync_status,

  request_payload,

  response_payload,

  error_message,

}) {

  try {

    await supabase

      .from(
        "ipos_sync_logs"
      )

      .insert({

        entity_type:
          "voucher",

        entity_id:
          voucher_id,

        sync_type,

        sync_status,

        request_payload,

        response_payload,

        error_message,

        created_at:
          new Date(),

      });

  } catch (logError) {

    console.error(

      "createVoucherSyncLog error:",

      logError.message

    );

  }

}

/**
 * =====================================================
 * UPDATE VOUCHER STATUS
 * =====================================================
 */

async function updateVoucherSyncStatus({

  voucher_id,

  sync_status,

  sync_error = null,

}) {

  try {

    await supabase

      .from("user_vouchers")

      .update({

        crm_sync_status:
          sync_status,

        crm_sync_error:
          sync_error,

        crm_last_synced_at:
          new Date(),

        updated_at:
          new Date(),

      })

      .eq(
        "id",
        voucher_id
      );

  } catch (error) {

    console.error(

      "updateVoucherSyncStatus error:",

      error.message

    );

  }

}

/**
 * =====================================================
 * PUSH VOUCHER TO IPOS
 * =====================================================
 */

async function syncVoucherToIPOS({

  voucher,

}) {

  /**
   * ============================================
   * VALIDATE
   * ============================================
   */

  validateVoucherPayload(
    voucher
  );

  /**
   * ============================================
   * PAYLOAD
   * ============================================
   */

  const payload =

    buildVoucherPayload(
      voucher
    );

  try {

    /**
     * ============================================
     * REQUEST
     * ============================================
     */

    const response =

      await iposClient.post(

        "/vouchers/create-or-update",

        payload

      );

    /**
     * ============================================
     * RESPONSE VALIDATION
     * ============================================
     */

    if (

      !response.data ||

      response.status >= 400

    ) {

      throw new Error(
        "Invalid IPOS response"
      );

    }

    /**
     * ============================================
     * UPDATE STATUS
     * ============================================
     */

    await updateVoucherSyncStatus({

      voucher_id:
        voucher.id,

      sync_status:
        "synced",

    });

    /**
     * ============================================
     * LOG
     * ============================================
     */

    await createVoucherSyncLog({

      voucher_id:
        voucher.id,

      sync_type:
        "push_voucher",

      sync_status:
        "success",

      request_payload:
        payload,

      response_payload:
        response.data,

    });

    /**
     * ============================================
     * RETURN
     * ============================================
     */

    return {

      success: true,

      response:
        response.data,

    };

  } catch (error) {

    console.error(

      "syncVoucherToIPOS error:",

      error.message

    );

    /**
     * ============================================
     * UPDATE STATUS
     * ============================================
     */

    await updateVoucherSyncStatus({

      voucher_id:
        voucher.id,

      sync_status:
        "failed",

      sync_error:
        error.message,

    });

    /**
     * ============================================
     * LOG
     * ============================================
     */

    await createVoucherSyncLog({

      voucher_id:
        voucher.id,

      sync_type:
        "push_voucher",

      sync_status:
        "failed",

      request_payload:
        payload,

      error_message:
        error.message,

    });

    return {

      success: false,

      error:
        error.message,

    };

  }

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  syncVoucherToIPOS,

};
const axios = require("axios");

const menuCache =
  require("../cache/menuCache");

/**
 * =====================================================
 * ENV
 * =====================================================
 */

const BASE_URL =
  process.env.IPOS_BASE_URL ||
  "https://api.foodbook.vn";

const ACCESS_TOKEN =
  process.env.IPOS_ACCESS_TOKEN;

const POS_PARENT =
  process.env.IPOS_POS_PARENT;

const POS_ID =
  process.env.IPOS_POS_ID;

const MENU_TYPE =
  process.env.IPOS_MENU_TYPE || "DELI";

/**
 * =====================================================
 * VALIDATE ENV
 * =====================================================
 */

if (!ACCESS_TOKEN) {

  console.error(
    "❌ Missing IPOS_ACCESS_TOKEN"
  );

}

if (!POS_PARENT) {

  console.error(
    "❌ Missing IPOS_POS_PARENT"
  );

}

if (!POS_ID) {

  console.error(
    "❌ Missing IPOS_POS_ID"
  );

}

/**
 * =====================================================
 * AXIOS CLIENT
 * =====================================================
 */

const client =
  axios.create({

    baseURL:
      BASE_URL,

    timeout: 15000,

  });

/**
 * =====================================================
 * HANDLE ERROR
 * =====================================================
 */

function handleError(
  error,
  apiName
) {

  console.error(
    `❌ ${apiName} ERROR`
  );

  if (
    error.response
  ) {

    console.error({

      status:
        error.response.status,

      data:
        error.response.data,

    });

  } else {

    console.error(
      error.message
    );

  }

  return [];

}

/**
 * =====================================================
 * NORMALIZE MENU
 * =====================================================
 */

function normalizeMenu(
  rawData
) {

  if (
    !Array.isArray(rawData)
  ) {

    return [];

  }

  return rawData.map(
    (item) => ({

      id:

        item.store_item_id ||

        item.id ||

        "",

      foodbook_id:
        item.id,

      name:

        item.name ||

        "Unknown",

      price:

        Number(

          item.ta_price ||

          item.ots_price ||

          0

        ),

      image:

        item.image_url ||

        "",

      category:

        item.type_id ||

        "MENU",

      description:

        item.description ||

        "",

      active:

        item.status ===
        "ACTIVE",

      featured:

        item.is_featured === 1,

      customizations:

        item.customizations ||

        [],

      raw:
        item,

    })
  );

}

/**
 * =====================================================
 * DETECT MENU ARRAY
 * =====================================================
 */

function detectMenuItems(
  rawData
) {

  /**
   * ARRAY ROOT
   */

  if (
    Array.isArray(rawData)
  ) {

    return rawData;

  }

  /**
   * data[]
   */

  if (
    Array.isArray(
      rawData?.data
    )
  ) {

    return rawData.data;

  }

  /**
   * data.list[]
   */

  if (
    Array.isArray(
      rawData?.data?.list
    )
  ) {

    return rawData.data.list;

  }

  /**
   * data.items[]
   */

  if (
    Array.isArray(
      rawData?.data?.items
    )
  ) {

    return rawData.data.items;

  }

  /**
   * items[]
   */

  if (
    Array.isArray(
      rawData?.items
    )
  ) {

    return rawData.items;

  }

  /**
   * result[]
   */

  if (
    Array.isArray(
      rawData?.result
    )
  ) {

    return rawData.result;

  }

  /**
   * products[]
   */

  if (
    Array.isArray(
      rawData?.products
    )
  ) {

    return rawData.products;

  }

  return [];

}

/**
 * =====================================================
 * GET MENU
 * =====================================================
 */

async function getMenu() {

  try {

    /**
     * =====================================================
     * CACHE VALIDATION
     * =====================================================
     */

    const now =
      Date.now();

    const CACHE_TIME =
      60 * 1000;

    /**
     * USE CACHE
     */

    if (

      menuCache.data.length > 0 &&

      menuCache.updatedAt &&

      now - menuCache.updatedAt <
        CACHE_TIME

    ) {

      console.log(
        "⚡ MENU CACHE HIT"
      );

      return menuCache.data;

    }

    /**
     * API REQUEST
     */

    const response =
      await client.get(
        "/ipos/ws/xpartner/v2/items",
        {
          params: {

            access_token:
              ACCESS_TOKEN,

            pos_parent:
              POS_PARENT,

            pos_id:
              POS_ID,

            menu_type:
              MENU_TYPE,

          },
        }
      );

    /**
     * RAW DATA
     */

    const rawData =
      response.data;

    console.log(
      "📦 RAW MENU RECEIVED"
    );

    /**
     * DETECT ITEMS
     */

    const items =
      detectMenuItems(
        rawData
      );

    /**
     * NORMALIZE
     */

    const normalized =
      normalizeMenu(
        items
      );

    /**
     * SAVE CACHE
     */

    menuCache.data =
      normalized;

    menuCache.updatedAt =
      Date.now();

    /**
     * DEBUG
     */

    console.log(
      `✅ MENU ITEMS: ${normalized.length}`
    );

    return normalized;

  } catch (error) {

    return handleError(
      error,
      "GET_MENU"
    );

  }

}

/**
 * =====================================================
 * GET MEMBER
 * =====================================================
 */

async function getMember(
  userId
) {

  try {

    const response =
      await client.get(
        "/ipos/ws/xpartner/membership_detail",
        {
          params: {

            access_token:
              ACCESS_TOKEN,

            pos_parent:
              POS_PARENT,

            user_id:
              userId,

          },
        }
      );

    return {

      success: true,

      data:
        response.data,

    };

  } catch (error) {

    console.error(error);

    return {

      success: false,

      error:
        error.message,

    };

  }

}

/**
 * =====================================================
 * GET MEMBER VOUCHERS
 * =====================================================
 */

async function getMemberVouchers(
  userId
) {

  try {

    const response =
      await client.get(
        "/ipos/ws/xpartner/member_vouchers",
        {
          params: {

            access_token:
              ACCESS_TOKEN,

            pos_parent:
              POS_PARENT,

            user_id:
              userId,

          },
        }
      );

    return {

      success: true,

      data:
        response.data,

    };

  } catch (error) {

    console.error(error);

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


async function updateMemberPoint({ phone, type_change, point_change, note }) {
  const axios = require("axios");
  const params = new URLSearchParams();
  params.append('pos_parent', process.env.IPOS_POS_PARENT);
  const iposPhone = String(phone).replace(/\D/g,"");
  params.append('phone_number', iposPhone.startsWith('84') ? iposPhone : '84' + iposPhone.slice(1));
  params.append('type_change', type_change);
  params.append('point_change', String(point_change));
  params.append('note', note || 'Cap nhat tu app');
  const res = await axios.post(
    'https://api.foodbook.vn/ipos/ws/partner/mbs/update_point',
    params,
    { headers: { 'access_token': process.env.IPOS_ACCESS_TOKEN } }
  );
  return res.data;
}


/**
 * =====================================================
 * GET MEMBER TRANSACTIONS
 * Lấy lịch sử tiêu dùng thật từ iPos CRM
 * API: GET /ipos/ws/xpartner/member_transactions
 * =====================================================
 * @param {string} userId  - phone hoặc zalo_user_id
 * @param {number} page    - trang (default 1)
 * @returns {{ success, data: { transactions[], total_spent, total_orders } }}
 */
async function getMemberTransactions(userId, page = 1) {
  try {
    const response = await client.get(
      "/ipos/ws/xpartner/member_transactions",
      {
        params: {
          access_token: ACCESS_TOKEN,
          pos_parent:   POS_PARENT,
          user_id:      userId,
          page,
        },
      }
    );
 
    const raw = response.data;
 
    // Foodhub trả nhiều dạng — handle tất cả
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data?.sale_logs)
        ? raw.data.sale_logs
        : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.data?.list)
            ? raw.data.list
            : [];
 
    // Tính tổng tiêu dùng từ transactions
    const total_spent = list.reduce((sum, t) => {
      const amount = Number(t.bill_amount || t.total_amount || t.amount || 0);
      return sum + amount;
    }, 0);
 
    return {
      success: true,
      data: {
        transactions: list,
        total_spent,
        total_orders: list.length,
        raw_response: raw,
      },
    };
  } catch (error) {
    console.error("❌ getMemberTransactions ERROR:", error.message);
    return {
      success: false,
      data: { transactions: [], total_spent: 0, total_orders: 0 },
      error: error.message,
    };
  }
}
 
/**
 * =====================================================
 * GET MEMBERSHIP LOG (lịch sử tích điểm có filter ngày)
 * API: GET /ipos/ws/xpartner/membership_log
 * =====================================================
 * @param {string} userId
 * @param {object} opts - { page, log_type, create_from, create_to, page_size }
 */
async function getMembershipLog(userId, opts = {}) {
  try {
    const {
      page      = 1,
      log_type  = "PAY",       // PAY = giao dịch thanh toán
      create_from,
      create_to,
      page_size = 100,
    } = opts;
 
    const params = {
      access_token: ACCESS_TOKEN,
      pos_parent:   POS_PARENT,
      user_id:      userId,
      page,
      log_type,
      page_size,
    };
 
    if (create_from) params.create_from = create_from;
    if (create_to)   params.create_to   = create_to;
 
    const response = await client.get(
      "/ipos/ws/xpartner/membership_log",
      { params }
    );
 
    const raw = response.data;
    const list = Array.isArray(raw?.data?.logs_membership)
      ? raw.data.logs_membership
      : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw)
          ? raw
          : [];
 
    const total_spent = list.reduce((sum, t) => {
      return sum + Number(t.amount || t.bill_amount || t.total_amount || 0);
    }, 0);
 
    return {
      success: true,
      data: { logs: list, total_spent, count: list.length },
    };
  } catch (error) {
    console.error("❌ getMembershipLog ERROR:", error.message);
    return {
      success: false,
      data: { logs: [], total_spent: 0, count: 0 },
      error: error.message,
    };
  }
}

async function getEstimateShipFee({ lat, lng, amount }) {
  try {
    const response = await client.get(
      "/ipos/ws/xpartner/estimate_ship_fee",
      {
        params: {
          access_token: ACCESS_TOKEN,
          pos_parent:   POS_PARENT,
          pos_id:       POS_ID,
          lat,
          lng,
          amount,
        },
      }
    );
    const raw = response.data;
    const fee = raw?.data?.fee ?? raw?.data?.ship_fee ?? raw?.ship_fee ?? null;
    return { success: true, ship_fee: Number(fee || 0), raw };
  } catch (error) {
    console.error("❌ getEstimateShipFee ERROR:", error.message);
    return { success: false, ship_fee: null, error: error.message };
  }
}


function clearMenuCache() {
  menuCache.data = [];
  menuCache.updatedAt = null;
}

async function refreshMenu() {
  clearMenuCache();
  return getMenu();
}

module.exports = {
  updateMemberPoint,

  getMenu,
  refreshMenu,
  clearMenuCache,

  getMember,

  getMemberVouchers,

  getMemberTransactions,

  getMembershipLog,
  getEstimateShipFee,

};


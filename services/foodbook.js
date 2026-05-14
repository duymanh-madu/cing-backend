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

module.exports = {

  getMenu,

  getMember,

  getMemberVouchers,

};
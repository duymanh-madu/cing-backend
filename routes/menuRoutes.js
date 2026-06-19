const express =
  require("express");

const router =
  express.Router();

const {
  getMenu,
} = require(
  "../services/foodbook"
);

const supabase =
  require("../supabase");


function normalizeDbMenuItem(row) {
  const raw =
    row.raw_data || {};

  return {
    id:
      row.foodbook_id ||
      row.store_item_id ||
      String(row.id),

    foodbook_id:
      row.foodbook_id,

    store_item_id:
      row.store_item_id,

    name:
      row.name ||
      raw.name ||
      "Món",

    category:
      row.category ||
      raw.type_id ||
      "Khác",

    price:
      Number(
        row.price ??
        raw.ta_price ??
        raw.ots_price ??
        0
      ),

    image:
      row.image ||
      raw.image_url ||
      "",

    description:
      row.description ||
      raw.description ||
      "",

    active:
      row.active !== false,

    featured:
      !!row.featured,

    customizations:
      Array.isArray(raw.customizations)
        ? raw.customizations
        : [],

    raw_data:
      raw,

    updated_at:
      row.updated_at,
  };
}

async function getMenuFromDbFallback() {
  const { data, error } =
    await supabase
      .from("menu_items")
      .select("id,foodbook_id,store_item_id,name,category,price,image,description,active,featured,raw_data,updated_at")
      .eq("active", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true });

  if (error) {
    throw new Error(`DB menu fallback failed: ${error.message}`);
  }

  return (data || []).map(normalizeDbMenuItem);
}

/**
 * =====================================================
 * GET MENU
 * =====================================================
 */

router.get(
  "/",

  async (
    req,
    res
  ) => {

    try {

      /**
       * ===============================================
       * FETCH MENU
       * ===============================================
       */

      let items = [];

      try {
        items =
          await getMenu();
      } catch (menuError) {
        console.warn(
          "[MENU] Foodbook/iPOS menu failed, fallback DB:",
          menuError.message
        );
      }

      if (
        !Array.isArray(items) ||
        items.length === 0
      ) {
        console.warn(
          "[MENU] Foodbook/iPOS returned empty menu, fallback to menu_items table"
        );

        items =
          await getMenuFromDbFallback();
      }

      /**
       * ===============================================
       * SUCCESS
       * ===============================================
       */

      return res.json({

        success: true,

        source:
          "menu",

        total:
          items.length,

        items,

      });

    } catch (
      error
    ) {

      console.error(
        "MENU ROUTE ERROR:",
        error
      );

      /**
       * ===============================================
       * ERROR
       * ===============================================
       */

      return res
        .status(500)
        .json({

          success: false,

          message:
            error.message,

          items: [],

        });

    }

  }
);


router.post(
  "/refresh",

  async (
    req,
    res
  ) => {

    try {

      const {
        refreshMenu,
      } = require("../services/foodbook");

      const items =
        await refreshMenu();

      return res.json({
        success: true,
        total: items.length,
        items,
        refreshedAt: new Date().toISOString(),
      });

    } catch (
      error
    ) {

      console.error(
        "MENU REFRESH ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });

    }

  }
);

/**
 * =====================================================
 * TEST ROUTE
 * =====================================================
 */

router.get(
  "/test",

  (
    req,
    res
  ) => {

    return res.json({

      success: true,

      route:
        "menu routes working",

      realtime: true,

      timestamp:
        Date.now(),

    });

  }
);

/**
 * =====================================================
 * EXPORT
 * =====================================================
 */

module.exports =
  router;
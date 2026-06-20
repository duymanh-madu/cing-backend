const axios = require("axios");

const BASE_URL = process.env.IPOS_BASE_URL || "https://api.foodbook.vn";
const ACCESS_TOKEN = process.env.IPOS_ACCESS_TOKEN;
const POS_PARENT = process.env.IPOS_POS_PARENT;
const POS_ID = process.env.IPOS_POS_ID;
const MENU_TYPE = process.env.IPOS_MENU_TYPE || "DELI";

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

function detectMenuItems(rawData) {
  if (Array.isArray(rawData)) return rawData;
  if (Array.isArray(rawData?.data?.items)) return rawData.data.items;
  if (Array.isArray(rawData?.data)) return rawData.data;
  if (Array.isArray(rawData?.data?.list)) return rawData.data.list;
  if (Array.isArray(rawData?.items)) return rawData.items;
  if (Array.isArray(rawData?.result)) return rawData.result;
  if (Array.isArray(rawData?.products)) return rawData.products;
  return [];
}

function normalizeIPOSItem(item) {
  return {
    id: item.store_item_id || String(item.id || ""),
    item_id: item.store_item_id || String(item.id || ""),
    foodbook_id: item.id != null ? String(item.id) : null,
    store_item_id: item.store_item_id || "",
    name: item.name || "Unknown",
    price: Number(item.ta_price || item.ots_price || 0),
    image: item.image_url || "",
    category: item.type_id || "MENU",
    description: item.description || "",
    active: item.status === "ACTIVE",
    featured: item.is_featured === 1,
    customizations: Array.isArray(item.customizations) ? item.customizations : [],
    raw_data: item,
  };
}

function menuTypeCandidates() {
  return Array.from(
    new Set([MENU_TYPE, "DELI", "", "STORE"].filter(v => v !== undefined && v !== null))
  );
}

async function fetchRawMenu(menuType) {
  const params = {
    access_token: ACCESS_TOKEN,
    pos_parent: POS_PARENT,
    pos_id: POS_ID,
  };

  if (menuType) {
    params.menu_type = menuType;
  }

  const response = await client.get("/ipos/ws/xpartner/v2/items", { params });
  return response.data;
}

async function fetchIPOSMenu() {
  const attempts = [];

  for (const menuType of menuTypeCandidates()) {
    const rawData = await fetchRawMenu(menuType);
    const rawItems = detectMenuItems(rawData);
    const items = rawItems.map(normalizeIPOSItem).filter(i => i.name && i.price >= 0);

    attempts.push({
      menuType: menuType || "(none)",
      count: items.length,
      trackid: rawData?.trackid || null,
    });

    if (items.length > 0) {
      return {
        success: true,
        source: "ipos",
        menuType: menuType || "(none)",
        count: items.length,
        items,
        attempts,
        trackid: rawData?.trackid || null,
      };
    }
  }

  return {
    success: false,
    source: "ipos",
    reason: "empty_ipos_menu",
    count: 0,
    items: [],
    attempts,
  };
}

async function diagnoseIPOSMenu() {
  const results = [];

  for (const menuType of menuTypeCandidates()) {
    try {
      const rawData = await fetchRawMenu(menuType);
      const rawItems = detectMenuItems(rawData);

      results.push({
        menuType: menuType || "(none)",
        rootType: Array.isArray(rawData) ? "array" : typeof rawData,
        rootKeys: rawData && typeof rawData === "object" && !Array.isArray(rawData)
          ? Object.keys(rawData).slice(0, 30)
          : [],
        dataKeys: rawData?.data && typeof rawData.data === "object"
          ? Object.keys(rawData.data).slice(0, 30)
          : [],
        dataItemsLength: Array.isArray(rawData?.data?.items)
          ? rawData.data.items.length
          : null,
        detectedCount: rawItems.length,
        trackid: rawData?.trackid || null,
        ip: rawData?.ip || null,
        firstItemKeys: rawItems[0] && typeof rawItems[0] === "object"
          ? Object.keys(rawItems[0]).slice(0, 30)
          : [],
      });
    } catch (error) {
      results.push({
        menuType: menuType || "(none)",
        error: error.response?.data || error.message,
        status: error.response?.status || null,
      });
    }
  }

  return results;
}


module.exports = {
  fetchIPOSMenu,
  diagnoseIPOSMenu,
};

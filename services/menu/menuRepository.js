const supabase = require("../../supabase");

function normalizeDbMenuItem(row) {
  const raw = row.raw_data || {};

  return {
    id: row.foodbook_id || row.store_item_id || String(row.id),
    item_id: row.store_item_id || row.foodbook_id || String(row.id),
    foodbook_id: row.foodbook_id,
    store_item_id: row.store_item_id,
    name: row.name || raw.name || "Món",
    category: row.category || raw.type_id || "MENU",
    price: Number(row.price ?? raw.ta_price ?? raw.ots_price ?? 0),
    image: row.image || raw.image_url || "",
    description: row.description || raw.description || "",
    active: row.active !== false,
    featured: !!row.featured,
    customizations: Array.isArray(raw.customizations) ? raw.customizations : [],
    raw_data: raw,
    updated_at: row.updated_at,
  };
}

async function getActiveMenuItems() {
  const { data, error } = await supabase
    .from("menu_items")
    .select("*")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).map(normalizeDbMenuItem);
}

async function syncMenuItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { synced: 0, inserted: 0, updated: 0 };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("menu_items")
    .select("id,foodbook_id,store_item_id");

  if (existingError) throw new Error(existingError.message);

  const byFoodbookId = new Map();
  const byStoreItemId = new Map();

  for (const row of existingRows || []) {
    if (row.foodbook_id) byFoodbookId.set(String(row.foodbook_id), row);
    if (row.store_item_id) byStoreItemId.set(String(row.store_item_id), row);
  }

  const inserts = [];
  const updates = [];

  for (const item of items) {
    const foodbookId = item.foodbook_id ? String(item.foodbook_id) : null;
    const storeItemId = item.store_item_id || item.item_id || "";

    const row = {
      foodbook_id: foodbookId,
      store_item_id: storeItemId,
      name: item.name || "Unknown",
      category: item.category || "MENU",
      price: Number(item.price || 0),
      image: item.image || "",
      description: item.description || "",
      active: item.active !== false,
      featured: !!item.featured,
      raw_data: item.raw_data || item.raw || item,
      updated_at: new Date().toISOString(),
    };

    const existing =
      (foodbookId && byFoodbookId.get(foodbookId)) ||
      (storeItemId && byStoreItemId.get(storeItemId));

    if (existing?.id) {
      updates.push({ id: existing.id, row });
    } else {
      inserts.push(row);
    }
  }

  let inserted = 0;
  let updated = 0;

  if (inserts.length > 0) {
    const { error } = await supabase.from("menu_items").insert(inserts);
    if (error) throw new Error(error.message);
    inserted = inserts.length;
  }

  for (const entry of updates) {
    const { error } = await supabase
      .from("menu_items")
      .update(entry.row)
      .eq("id", entry.id);

    if (error) throw new Error(error.message);
    updated += 1;
  }

  return {
    synced: inserted + updated,
    inserted,
    updated,
  };
}

module.exports = {
  getActiveMenuItems,
  syncMenuItems,
};

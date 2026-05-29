const supabase = require("../../supabase");

async function upsertCustomer({ zaloUser }) {
  const zaloId = zaloUser.zalo_id || zaloUser.id || "";
  if (!zaloId) throw new Error("Missing zalo_id");
  const rawPhone = (zaloUser.phone || "").replace(/\D/g, "");
  const phone = rawPhone
    ? (rawPhone.startsWith("84") ? "0" + rawPhone.slice(2) : rawPhone)
    : null;
  const upsertData = {
    zalo_id:    zaloId,
    name:       zaloUser.name   || "Khách hàng",
    avatar:     zaloUser.avatar || null,
    updated_at: new Date().toISOString(),
  };
  if (phone)             upsertData.phone    = phone;
  if (zaloUser.birthday) upsertData.birthday = zaloUser.birthday;
  const { data, error } = await supabase
    .from("customers")
    .upsert(upsertData, { onConflict: "zalo_id", ignoreDuplicates: false })
    .select("*").single();
  if (error) throw new Error("upsertCustomer: " + error.message);
  return normalizeCustomer(data);
}

async function findById(customerId) {
  const { data, error } = await supabase.from("customers").select("*").eq("id", customerId).single();
  if (error) return null;
  return normalizeCustomer(data);
}

async function findByZaloId(zaloId) {
  const { data, error } = await supabase.from("customers").select("*").eq("zalo_id", zaloId).single();
  if (error) return null;
  return normalizeCustomer(data);
}

async function findByPhone(phone) {
  const digits  = phone.replace(/\D/g, "");
  const phone0  = digits.startsWith("84") ? "0" + digits.slice(2) : digits;
  const phone84 = digits.startsWith("84") ? digits : "84" + digits.slice(1);
  const { data, error } = await supabase.from("customers").select("*")
    .or(`phone.eq.${phone0},phone.eq.${phone84}`).single();
  if (error) return null;
  return normalizeCustomer(data);
}

function normalizeCustomer(row) {
  if (!row) return null;
  return {
    id:          row.id,
    zalo_id:     row.zalo_id      || "",
    name:        row.name         || "Khách hàng",
    phone:       row.phone        || "",
    avatar:      row.avatar       || null,
    birthday:    row.birthday     || null,
    memberLevel: row.member_level || "standard",
    points:      row.points       || 0,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
    raw:         row,
  };
}

module.exports = { upsertCustomer, findById, findByZaloId, findByPhone };

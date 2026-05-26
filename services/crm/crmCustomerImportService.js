const axios    = require("axios");
const supabase = require("../../supabase");

const IPOS_BASE   = "https://api.foodbook.vn";
const TOKEN       = process.env.IPOS_ACCESS_TOKEN;
const POS_PARENT  = process.env.IPOS_POS_PARENT;
const PAGE_SIZE   = 100;

function normalizePhone(phone) {
  const str = String(phone).replace(/\D/g, "");
  if (str.startsWith("84")) return "0" + str.slice(2);
  if (str.startsWith("0"))  return str;
  return "0" + str;
}

function mapTier(membershipType) {
  const t = (membershipType || "").toUpperCase();
  if (t === "HVKC")     return "diamond";
  if (t === "HVV")      return "gold";
  if (t === "HVBAC")    return "silver";
  if (t === "FOODBOOK") return "bronze";
  return "bronze";
}

async function fetchCustomerPage(page) {
  const response = await axios.get(
    `${IPOS_BASE}/ipos/ws/partner/data/customer`,
    {
      params: { pos_parent: POS_PARENT, page, page_size: PAGE_SIZE },
      headers: { access_token: TOKEN },
      timeout: 15000,
    }
  );
  const raw = response.data;
  return Array.isArray(raw?.data) ? raw.data
       : Array.isArray(raw)       ? raw
       : [];
}

async function importAllCrmCustomers() {
  console.log("START IMPORT CRM CUSTOMERS...");
  const t0 = Date.now();

  let page     = 1;
  let imported = 0;
  let skipped  = 0;
  let errors   = 0;

  while (true) {
    console.log(`Fetching page ${page}...`);
    let customers;

    try {
      customers = await fetchCustomerPage(page);
    } catch (err) {
      console.error(`Page ${page} fetch error:`, err.message);
      break;
    }

    if (!customers || customers.length === 0) {
      console.log("No more data at page", page);
      break;
    }

    // Upsert từng batch vào Supabase
    const rows = customers
      .filter(c => c.phone_number)
      .map(c => {
        const phone = normalizePhone(c.phone_number);
        return {
          user_id:            phone,
          zalo_name:          c.name || "",
          phone_number:       phone,
          crm_tier:           mapTier(c.membership_type),
          crm_spend_alltime:  Number(c.payment_amount || 0),
          crm_orders_alltime: Number(c.eat_times || 0),
          crm_synced_at:      new Date().toISOString(),
        };
      });

    if (rows.length > 0) {
      const { error } = await supabase
        .from("players")
        .upsert(rows, {
          onConflict:        "user_id",
          ignoreDuplicates:  false,
        });

      if (error) {
        console.error(`Upsert page ${page} error:`, error.message);
        errors += rows.length;
      } else {
        imported += rows.length;
        console.log(`Page ${page}: upserted ${rows.length} customers (total: ${imported})`);
      }
    }

    skipped += customers.length - rows.length;

    // Hết data nếu trả về ít hơn page_size
    if (customers.length < PAGE_SIZE) {
      console.log("Last page reached at page", page);
      break;
    }

    page++;
    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`IMPORT DONE in ${elapsed}s — imported:${imported} skipped:${skipped} errors:${errors}`);

  return { success: true, imported, skipped, errors, elapsed_seconds: elapsed };
}

module.exports = { importAllCrmCustomers };

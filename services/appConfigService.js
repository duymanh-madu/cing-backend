const supabase =
  require("../supabase");

/**
 * =========================================
 * GET PUBLIC CONFIG
 * =========================================
 */

async function getPublicAppConfig() {

  const {
    data,
    error,
  } = await supabase

    .from("app_configs")

    .select("*")

    .order("id", {
      ascending: false,
    })

    .limit(1)

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

/**
 * =========================================
 * UPDATE CONFIG
 * =========================================
 */

async function updateAppConfig({
  id,
  payload,
}) {

  const {
    data,
    error,
  } = await supabase

    .from("app_configs")

    .update({

      ...payload,

      updated_at:
        new Date(),

    })

    .eq("id", id)

    .select("*")

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

/**
 * =========================================
 * CREATE DEFAULT CONFIG
 * =========================================
 */

async function createDefaultConfig() {

  const {
    data: existing,
  } = await supabase

    .from("app_configs")

    .select("id")

    .limit(1);

  if (
    existing &&
    existing.length > 0
  ) {

    return existing[0];

  }

  const {
    data,
    error,
  } = await supabase

    .from("app_configs")

    .insert({

      app_name:
        "Cing Hu Tang",

      slogan:
        "Trà sữa thế hệ mới",

      primary_color:
        "#C58B45",

      secondary_color:
        "#1F1F1F",

      ordering_enabled:
        true,

      payment_enabled:
        true,

      minigame_enabled:
        true,

      leaderboard_enabled:
        true,

      popup_enabled:
        true,

      voucher_enabled:
        true,

      realtime_enabled:
        true,

      delivery_enabled:
        true,

      banner_enabled:
        true,

      momo_enabled:
        true,

      bank_transfer_enabled:
        true,

    })

    .select("*")

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

/**
 * =========================================
 * EXPORTS
 * =========================================
 */

module.exports = {

  getPublicAppConfig,

  updateAppConfig,

  createDefaultConfig,

};
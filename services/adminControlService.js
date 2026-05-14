const supabase =
  require("../supabase");

/**
 * =========================================
 * GET CURRENT CONFIG
 * =========================================
 */

async function getCurrentConfig() {

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
 * UPDATE FEATURE FLAG
 * =========================================
 */

async function updateFeatureFlag({

  field,

  value,

}) {

  const config =
    await getCurrentConfig();

  if (!config) {

    throw new Error(
      "App config not found"
    );

  }

  const {
    data,
    error,
  } = await supabase

    .from("app_configs")

    .update({

      [field]:
        value,

      updated_at:
        new Date(),

    })

    .eq(
      "id",
      config.id
    )

    .select("*")

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  /**
   * REALTIME SOCKET EVENT
   */

  const io =
    global.io;

  if (io) {

    io.emit(

      "admin:config_updated",

      {

        field,

        value,

        updated_at:
          new Date(),

      }

    );

  }

  return data;

}

/**
 * =========================================
 * UPDATE MULTIPLE CONFIGS
 * =========================================
 */

async function updateConfigs(
  payload
) {

  const config =
    await getCurrentConfig();

  if (!config) {

    throw new Error(
      "App config not found"
    );

  }

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

    .eq(
      "id",
      config.id
    )

    .select("*")

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  /**
   * REALTIME BROADCAST
   */

  const io =
    global.io;

  if (io) {

    io.emit(

      "admin:configs_updated",

      data

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

  getCurrentConfig,

  updateFeatureFlag,

  updateConfigs,

};
const supabase =
  require("../supabase");

let cachedConfig =
  null;

let lastFetchedAt =
  null;

const CACHE_TTL =
  30000;

async function getConfig() {

  const now =
    Date.now();

  if (

    cachedConfig &&

    lastFetchedAt &&

    now - lastFetchedAt <
      CACHE_TTL

  ) {

    return cachedConfig;

  }

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

  cachedConfig =
    data;

  lastFetchedAt =
    now;

  return cachedConfig;

}

function invalidateConfigCache() {

  cachedConfig =
    null;

  lastFetchedAt =
    null;

}

module.exports = {

  getConfig,

  invalidateConfigCache,

};
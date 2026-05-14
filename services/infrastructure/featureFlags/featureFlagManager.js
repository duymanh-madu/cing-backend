const supabase =
  require("../../supabase");

const cacheManager =
  require(
    "../cache/cacheManager"
  );

async function isFeatureEnabled(

  key

) {

  const cacheKey =

    `feature:${key}`;

  const cached =

    await cacheManager.get(
      cacheKey
    );

  if (
    cached !== null
  ) {

    return cached;
  }

  const {

    data,

  } = await supabase

    .from("feature_flags")

    .select("*")

    .eq(
      "key",
      key
    )

    .maybeSingle();

  const enabled =

    !!data?.enabled;

  await cacheManager.set({

    key:
      cacheKey,

    value:
      enabled,

    ttl: 30000,

  });

  return enabled;

}

module.exports = {

  isFeatureEnabled,

};
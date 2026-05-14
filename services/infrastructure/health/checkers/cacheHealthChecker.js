const cacheManager =
  require(
    "../../cache/cacheManager"
  );

async function checkCacheHealth() {

  try {

    const stats =

      await cacheManager.stats();

    return {

      service:
        "cache",

      healthy: true,

      stats,

    };

  } catch {

    return {

      service:
        "cache",

      healthy:
        false,

    };

  }

}

module.exports = {

  checkCacheHealth,

};
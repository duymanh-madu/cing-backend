const distributedCaches =
  new Map();

/**
 * =====================================================
 * SET CACHE
 * =====================================================
 */

function setDistributedCache({

  key,

  value,

  ttl = 60000,

}) {

  distributedCaches.set(

    key,

    {

      value,

      ttl,

      created_at:
        Date.now(),

      expires_at:
        Date.now() + ttl,

    }

  );

}

/**
 * =====================================================
 * GET CACHE
 * =====================================================
 */

function getDistributedCache(
  key
) {

  const cache =
    distributedCaches.get(
      key
    );

  if (!cache) {

    return null;

  }

  if (
    Date.now() >
    cache.expires_at
  ) {

    distributedCaches.delete(
      key
    );

    return null;

  }

  return cache.value;

}

/**
 * =====================================================
 * INVALIDATE CACHE
 * =====================================================
 */

function invalidateDistributedCache(
  key
) {

  distributedCaches.delete(
    key
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  setDistributedCache,

  getDistributedCache,

  invalidateDistributedCache,

};
const cache =
  new Map();

/**
 * ============================================
 * SET CACHE
 * ============================================
 */

function setCache({

  key,

  value,

  ttl = 60000,

}) {

  const expires_at =

    Date.now() + ttl;

  cache.set(key, {

    value,

    expires_at,

  });

}

/**
 * ============================================
 * GET CACHE
 * ============================================
 */

function getCache(key) {

  const data =
    cache.get(key);

  if (!data) {

    return null;

  }

  if (

    Date.now() >
    data.expires_at

  ) {

    cache.delete(key);

    return null;

  }

  return data.value;

}

/**
 * ============================================
 * DELETE CACHE
 * ============================================
 */

function deleteCache(
  key
) {

  cache.delete(key);

}

/**
 * ============================================
 * CLEAR CACHE
 * ============================================
 */

function clearCache() {

  cache.clear();

}

module.exports = {

  setCache,

  getCache,

  deleteCache,

  clearCache,

};
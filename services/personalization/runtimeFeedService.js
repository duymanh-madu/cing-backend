const runtimeFeeds =
  new Map();

/**
 * =====================================================
 * UPDATE RUNTIME FEED
 * =====================================================
 */

function updateRuntimeFeed({

  user_id,

  feed_items,

}) {

  runtimeFeeds.set(

    user_id,

    {

      feed_items:
        feed_items || [],

      updated_at:
        Date.now(),

    }

  );

}

/**
 * =====================================================
 * GET RUNTIME FEED
 * =====================================================
 */

function getRuntimeFeed(
  user_id
) {

  return (
    runtimeFeeds.get(
      user_id
    ) || null
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  updateRuntimeFeed,

  getRuntimeFeed,

};
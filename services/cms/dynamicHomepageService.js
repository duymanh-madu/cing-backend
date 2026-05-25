const homepageBlocks =
  [];

/**
 * =====================================================
 * REGISTER HOMEPAGE BLOCK
 * =====================================================
 */

function registerHomepageBlock({

  code,

  type,

  title,

  enabled = true,

  position = 0,

  metadata = {},

}) {

  homepageBlocks.push({

    code,

    type,

    title,

    enabled,

    position,

    metadata,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET HOMEPAGE BLOCKS
 * =====================================================
 */

function getHomepageBlocks() {

  return homepageBlocks

    .filter(
      (
        item
      ) => item.enabled
    )

    .sort(
      (
        a,
        b
      ) =>
        a.position -
        b.position
    );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  registerHomepageBlock,

  getHomepageBlocks,

};
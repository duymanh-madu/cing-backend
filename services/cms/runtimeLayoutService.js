const layouts =
  [];

/**
 * =====================================================
 * REGISTER LAYOUT
 * =====================================================
 */

function registerRuntimeLayout({

  code,

  blocks,

  enabled = true,

}) {

  layouts.push({

    code,

    blocks:
      blocks || [],

    enabled,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET ACTIVE LAYOUTS
 * =====================================================
 */

function getActiveLayouts() {

  return layouts.filter(

    (
      item
    ) => item.enabled

  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  registerRuntimeLayout,

  getActiveLayouts,

};
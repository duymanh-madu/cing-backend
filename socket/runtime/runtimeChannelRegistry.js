const RUNTIME_CHANNELS = {

  ADMIN:
    "runtime:admin",

  PAYMENT:
    "runtime:payment",

  CAMPAIGN:
    "runtime:campaign",

  GAME:
    "runtime:game",

  NOTIFICATION:
    "runtime:notification",

};

/**
 * =====================================================
 * GET CHANNELS
 * =====================================================
 */

function getRuntimeChannels() {

  return RUNTIME_CHANNELS;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  RUNTIME_CHANNELS,

  getRuntimeChannels,

};
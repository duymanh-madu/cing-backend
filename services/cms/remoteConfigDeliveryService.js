const remoteConfigs =
  new Map();

/**
 * =====================================================
 * SET REMOTE CONFIG
 * =====================================================
 */

function setRemoteConfig({

  key,

  value,

}) {

  remoteConfigs.set(

    key,

    {

      value,

      updated_at:
        Date.now(),

    }

  );

}

/**
 * =====================================================
 * GET REMOTE CONFIG
 * =====================================================
 */

function getRemoteConfig(
  key
) {

  return (
    remoteConfigs.get(
      key
    ) || null
  );

}

/**
 * =====================================================
 * GET ALL CONFIGS
 * =====================================================
 */

function getAllRemoteConfigs() {

  return Object.fromEntries(
    remoteConfigs
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  setRemoteConfig,

  getRemoteConfig,

  getAllRemoteConfigs,

};
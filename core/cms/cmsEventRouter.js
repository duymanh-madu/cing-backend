const {

  registerHomepageBlock,

} = require(
  "../../services/cms/dynamicHomepageService"
);

const {

  createRuntimeContent,

} = require(
  "../../services/cms/runtimeContentService"
);

const {

  setRemoteConfig,

} = require(
  "../../services/cms/remoteConfigDeliveryService"
);

/**
 * =====================================================
 * CMS EVENT ROUTER
 * =====================================================
 */

function routeCmsEvent({

  type,

  payload,

}) {

  switch (
    type
  ) {

    case "homepage_block_created":

      registerHomepageBlock(
        payload
      );

      break;

    case "runtime_content_created":

      createRuntimeContent(
        payload
      );

      break;

    case "remote_config_updated":

      setRemoteConfig(
        payload
      );

      break;

    default:

      break;

  }

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  routeCmsEvent,

};
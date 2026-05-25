const {

  generatePersonalizedHomepage,

} = require(
  "../../services/personalization/personalizedHomepageService"
);

const {

  updateRuntimeFeed,

} = require(
  "../../services/personalization/runtimeFeedService"
);

const {

  updateUserJourney,

} = require(
  "../../services/personalization/userExperienceOrchestratorService"
);

const {

  updateSessionIntelligence,

} = require(
  "../../services/personalization/sessionIntelligenceService"
);

/**
 * =====================================================
 * PERSONALIZATION EVENT ROUTER
 * =====================================================
 */

function routePersonalizationEvent({

  type,

  payload,

}) {

  switch (
    type
  ) {

    case "homepage_personalization":

      generatePersonalizedHomepage(
        payload
      );

      break;

    case "runtime_feed_update":

      updateRuntimeFeed(
        payload
      );

      break;

    case "user_journey_update":

      updateUserJourney(
        payload
      );

      break;

    case "session_update":

      updateSessionIntelligence(
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

  routePersonalizationEvent,

};
const attributionEvents =
  [];

/**
 * =====================================================
 * TRACK ATTRIBUTION
 * =====================================================
 */

function trackCampaignAttribution({

  user_id,

  campaign_id,

  source,

  action,

}) {

  attributionEvents.push({

    user_id,

    campaign_id,

    source,

    action,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET ATTRIBUTIONS
 * =====================================================
 */

function getCampaignAttributions() {

  return attributionEvents;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  trackCampaignAttribution,

  getCampaignAttributions,

};
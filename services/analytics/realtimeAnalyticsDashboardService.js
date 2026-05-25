const {

  aggregateAnalytics,

} = require(
  "./analyticsAggregationService"
);

const {

  getCampaignAttributions,

} = require(
  "./campaignAttributionService"
);

/**
 * =====================================================
 * GET REALTIME DASHBOARD
 * =====================================================
 */

function getRealtimeAnalyticsDashboard() {

  const analytics =
    aggregateAnalytics();

  const attributions =
    getCampaignAttributions();

  return {

    analytics,

    attributions_count:
      attributions.length,

    generated_at:
      Date.now(),

  };

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  getRealtimeAnalyticsDashboard,

};
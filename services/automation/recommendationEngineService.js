const recommendations =
  [];

/**
 * =====================================================
 * GENERATE RECOMMENDATION
 * =====================================================
 */

function generateRecommendation({

  user_id,

  recommendation_type,

  items,

}) {

  const recommendation = {

    user_id,

    recommendation_type,

    items:
      items || [],

    generated_at:
      Date.now(),

  };

  recommendations.push(
    recommendation
  );

  return recommendation;

}

/**
 * =====================================================
 * GET RECOMMENDATIONS
 * =====================================================
 */

function getRecommendations({

  user_id,

}) {

  return recommendations.filter(

    (
      item
    ) =>

      item.user_id ===
      user_id

  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  generateRecommendation,

  getRecommendations,

};
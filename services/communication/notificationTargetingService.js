const targetingRules =
  [];

/**
 * =====================================================
 * CREATE TARGETING RULE
 * =====================================================
 */

function createTargetingRule({

  code,

  target_type,

  conditions,

}) {

  targetingRules.push({

    code,

    target_type,

    conditions:
      conditions || {},

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET TARGETING RULES
 * =====================================================
 */

function getTargetingRules() {

  return targetingRules;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  createTargetingRule,

  getTargetingRules,

};
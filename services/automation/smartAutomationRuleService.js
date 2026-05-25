const automationRules =
  [];

/**
 * =====================================================
 * CREATE AUTOMATION RULE
 * =====================================================
 */

function createAutomationRule({

  code,

  trigger,

  conditions,

  actions,

  enabled = true,

}) {

  automationRules.push({

    code,

    trigger,

    conditions:
      conditions || [],

    actions:
      actions || [],

    enabled,

    created_at:
      Date.now(),

  });

}

/**
 * =====================================================
 * GET RULES
 * =====================================================
 */

function getAutomationRules() {

  return automationRules;

}

/**
 * =====================================================
 * FIND MATCHING RULES
 * =====================================================
 */

function findMatchingRules(
  trigger
) {

  return automationRules.filter(

    (
      item
    ) =>

      item.enabled &&

      item.trigger ===
        trigger

  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  createAutomationRule,

  getAutomationRules,

  findMatchingRules,

};
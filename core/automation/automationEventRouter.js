const {

  findMatchingRules,

} = require(
  "../../services/automation/smartAutomationRuleService"
);

const {

  executeOperationalAutomation,

} = require(
  "../../services/automation/operationalAutomationService"
);

/**
 * =====================================================
 * ROUTE AUTOMATION EVENT
 * =====================================================
 */

function routeAutomationEvent({

  type,

  payload,

}) {

  const rules =
    findMatchingRules(
      type
    );

  for (
    const rule of rules
  ) {

    for (
      const action of
      rule.actions
    ) {

      executeOperationalAutomation({

        type:
          action.type,

        payload: {

          trigger:
            type,

          source_payload:
            payload,

          action,

        },

      });

    }

  }

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  routeAutomationEvent,

};
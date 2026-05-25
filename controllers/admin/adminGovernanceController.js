const {

  getAuditTimeline,

} = require(
  "../../services/admin/adminAuditTimelineService"
);

const {

  ROLE_HIERARCHY,

} = require(
  "../../services/admin/adminRoleHierarchyService"
);

const {

  getFeatureDeliveries,

} = require(
  "../../services/admin/adminFeatureDeliveryService"
);

/**
 * =====================================================
 * GET GOVERNANCE STATE
 * =====================================================
 */

async function getGovernanceState(
  req,
  res
) {

  try {

    return res.json({

      success: true,

      data: {

        roles:
          ROLE_HIERARCHY,

        audit_timeline:
          getAuditTimeline(),

        feature_delivery:
          getFeatureDeliveries(),

      },

    });

  } catch (error) {

    return res.status(500).json({

      success: false,

      error:
        error.message,

    });

  }

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  getGovernanceState,

};
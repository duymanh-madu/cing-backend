const {

  getRuntimeConfig,

  updateRuntimeConfig,

} = require(
  "../../services/admin/adminRuntimeConfigService"
);

const {

  enableMaintenance,

  disableMaintenance,

  getMaintenanceState,

} = require(
  "../../services/admin/adminMaintenanceService"
);

const {

  getFeatureFlags,

  enableFeature,

  disableFeature,

} = require(
  "../../services/admin/adminFeatureFlagService"
);

const {

  getModules,

} = require(
  "../../services/admin/adminModuleRegistryService"
);

/**
 * =====================================================
 * GET SYSTEM STATE
 * =====================================================
 */

async function getSystemState(
  req,
  res
) {

  try {

    return res.json({

      success: true,

      data: {

        runtime:
          getRuntimeConfig(),

        maintenance:
          getMaintenanceState(),

        features:
          getFeatureFlags(),

        modules:
          getModules(),

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
 * UPDATE RUNTIME
 * =====================================================
 */

async function updateSystemRuntime(
  req,
  res
) {

  try {

    const updated =
      updateRuntimeConfig(
        req.body
      );

    return res.json({

      success: true,

      data:
        updated,

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
 * ENABLE FEATURE
 * =====================================================
 */

async function enableSystemFeature(
  req,
  res
) {

  try {

    enableFeature(
      req.params.feature
    );

    return res.json({

      success: true,

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
 * DISABLE FEATURE
 * =====================================================
 */

async function disableSystemFeature(
  req,
  res
) {

  try {

    disableFeature(
      req.params.feature
    );

    return res.json({

      success: true,

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
 * ENABLE MAINTENANCE
 * =====================================================
 */

async function enableSystemMaintenance(
  req,
  res
) {

  try {

    const result =
      enableMaintenance(
        req.body
      );

    return res.json({

      success: true,

      data:
        result,

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
 * DISABLE MAINTENANCE
 * =====================================================
 */

async function disableSystemMaintenance(
  req,
  res
) {

  try {

    const result =
      disableMaintenance();

    return res.json({

      success: true,

      data:
        result,

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

  getSystemState,

  updateSystemRuntime,

  enableSystemFeature,

  disableSystemFeature,

  enableSystemMaintenance,

  disableSystemMaintenance,

};
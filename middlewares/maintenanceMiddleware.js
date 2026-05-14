const configCacheService =
  require(
    "../services/configCacheService"
  );

async function maintenanceMiddleware(

  req,

  res,

  next

) {

  try {

    /**
     * ============================================
     * SKIP HEALTH
     * ============================================
     */

    if (

      req.originalUrl === "/" ||

      req.originalUrl ===
        "/health"

    ) {

      return next();

    }

    /**
     * ============================================
     * CONFIG
     * ============================================
     */

    const config =

      await configCacheService.getConfig();

    /**
     * ============================================
     * MAINTENANCE MODE
     * ============================================
     */

    if (

      config?.maintenance_mode

    ) {

      return res.status(503).json({

        success: false,

        code:
          "MAINTENANCE_MODE",

        message:
          "Hệ thống đang bảo trì",

      });

    }

    next();

  } catch (error) {

    next();

  }

}

module.exports =
  maintenanceMiddleware;
const {
  createExpressApp,
} = require(
  "../config/express"
);

/**
 * =====================================================
 * ROUTES
 * =====================================================
 */

const routes =
  require("../routes");

const healthRoutes =
  require(
    "../routes/healthRoutes"
  );

const appRoutes =
  require(
    "../routes/app.routes"
  );

/**
 * =====================================================
 * MIDDLEWARES
 * =====================================================
 */

const errorMiddleware =
  require(
    "../middlewares/errorMiddleware"
  );

const notFoundHandler =
  require(
    "../middlewares/notFoundHandler"
  );

const requestMetricsMiddleware =
  require(
    "../middlewares/requestMetricsMiddleware"
  );

const requestLogger =
  require(
    "../services/infrastructure/logger/requestLogger"
  );

const traceContextMiddleware =
  require(
    "../middlewares/traceContextMiddleware"
  );

const maintenanceMiddleware =
  require(
    "../middlewares/maintenanceMiddleware"
  );

/**
 * =====================================================
 * CREATE APP
 * =====================================================
 */

function createApp() {

  /**
   * ============================================
   * EXPRESS APP
   * ============================================
   */

  const app =
    createExpressApp();

  /**
   * ============================================
   * APP RUNTIME METADATA
   * ============================================
   */

  app.locals.runtime = {

    bootedAt:
      Date.now(),

    environment:
      process.env.NODE_ENV ||
      "development",

    version:
      process.env.APP_VERSION ||
      "1.0.0",

  };

  /**
   * ============================================
   * HEALTH ROUTES
   * ============================================
   */

  app.use(
    healthRoutes
  );

  /**
   * ============================================
   * REQUEST CONTEXT
   * ============================================
   */

  app.use(
    traceContextMiddleware
  );

  app.use(
    requestLogger
  );

  app.use(
    requestMetricsMiddleware
  );

  /**
   * ============================================
   * MAINTENANCE MODE
   * ============================================
   */

  app.use(
    maintenanceMiddleware
  );

  /**
   * ============================================
   * APP RUNTIME ROUTES
   * ============================================
   */

  app.use(
    "/app",
    appRoutes
  );

  /**
   * ============================================
   * api ROUTES
   * ============================================
   */

  app.use(
    "/api",
    routes
  );

  /**
   * ============================================
   * 404 HANDLER
   * ============================================
   */

  app.use(
    notFoundHandler
  );

  /**
   * ============================================
   * GLOBAL ERROR HANDLER
   * ============================================
   */

  app.use(
    errorMiddleware
  );

  /**
   * ============================================
   * RETURN
   * ============================================
   */

  return app;

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  createApp,

};
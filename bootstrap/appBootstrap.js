const express =
  require("express");

const cors =
  require("cors");

const helmet =
  require("helmet");

const compression =
  require("compression");

const morgan =
  require("morgan");

/**
 * =====================================================
 * MIDDLEWARES
 * =====================================================
 */

const apiLogger =
  require(
    "../middlewares/apiLogger"
  );

const requestContextMiddleware =
  require(
    "../middlewares/requestContextMiddleware"
  );

const traceContextMiddleware =
  require(
    "../middlewares/traceContextMiddleware"
  );

/**
 * =====================================================
 * ROUTES
 * =====================================================
 */

const routes =
  require("../routes");

const paymentWebhookRoutes =
  require("../routes/paymentWebhookRoutes");

/**
 * =====================================================
 * CREATE APP
 * =====================================================
 */

function createApp() {

  const app =
    express();

  /**
   * =================================================
   * TRUST PROXY
   * =================================================
   */

  app.set(
    "trust proxy",
    1
  );

  /**
   * =================================================
   * SECURITY
   * =================================================
   */

  app.use(
    helmet()
  );

  app.use(
    cors({

      origin: true,

      credentials: true,

    })
  );

  /**
   * =================================================
   * PERFORMANCE
   * =================================================
   */

  app.use(
    compression()
  );

  /**
   * =================================================
   * PARSERS
   * =================================================
   */

  app.use(
    express.json({

      limit: "10mb",

    })
  );

  app.use(
    express.urlencoded({

      extended: true,

    })
  );

  /**
   * =================================================
   * HTTP LOGGING
   * =================================================
   */

  app.use(
    morgan("dev")
  );

  app.use(
    apiLogger
  );

  /**
   * =================================================
   * REQUEST CONTEXT
   * =================================================
   */

  app.use(
    requestContextMiddleware
  );

  app.use(
    traceContextMiddleware
  );

  /**
   * =================================================
   * API ROUTES
   * =================================================
   */

  // Serve static files from public folder
  app.use(require("express").static(require("path").join(__dirname, "../public")));

  // Keep-alive endpoint
  app.get('/ping', (req, res) => res.json({ ok:true, t:Date.now() }));

  // Zalo domain verification - must be at root level
  app.get("/zalo_verifierU8VZ5vBvLGrmZyGXZuTg70Mkno3fs1P_CpOu.html", (req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send("zalo-platform-site-verification=U8VZ5vBvLGrmZyGXZuTg70Mkno3fs1P_CpOu");
  });

  // Zalo Checkout callback must be mounted directly before general /api routes.
  app.use(
    "/api/payment/webhook",
    paymentWebhookRoutes
  );

  app.use(
    "/api",
    routes
  );

  /**
   * =================================================
   * HEALTHCHECK
   * =================================================
   */

  app.get(
    "/health",
    (
      req,
      res
    ) => {

      return res.json({

        success: true,

        service:
          "cing-backend",

        realtime: true,

        websocket: true,

        payment: true,

        timestamp:
          Date.now(),

      });

    }
  );

  /**
   * =================================================
   * ROOT
   * =================================================
   */

  app.get(
    "/",
    (
      req,
      res
    ) => {

      return res.json({

        success: true,

        app:
          "CING HU TANG BACKEND",

        timestamp:
          Date.now(),

      });

    }
  );

  /**
   * =================================================
   * 404 HANDLER
   * =================================================
   */

  app.use(
    (
      req,
      res
    ) => {

      return res
        .status(404)
        .json({

          success: false,

          code:
            "ROUTE_NOT_FOUND",

          message:
            "API route not found",

          path:
            req.originalUrl,

          method:
            req.method,

        });

    }
  );

const attachObservability =
  require("./attachObservability");

attachObservability(app);

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
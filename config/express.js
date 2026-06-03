const express =
  require("express");

const compression =
  require("compression");

const helmet =
  require("helmet");

const cors =
  require("cors");

const crypto =
  require("crypto");

const {
  globalLimiter,
} = require(
  "../middlewares/rateLimiter"
);

const apiLogger =
  require(
    "../middlewares/apiLogger"
);

function createExpressApp() {

  const app =
    express();

  /**
   * =========================================
   * TRUST PROXY
   * =========================================
   */

  app.set(
    "trust proxy",
    1
  );

  /**
   * =========================================
   * SECURITY
   * =========================================
   */

  app.disable(
    "x-powered-by"
  );

  app.use(

    helmet({

      crossOriginResourcePolicy:
        false,

    })

  );

  app.use(
    compression()
  );

  app.use(

    cors({
      origin: (() => {
        const o = process.env.CORS_ORIGIN || "*";
        if (o === "*") return "*";
        const list = o.split(",").map(s => s.trim());
        return list.length === 1 ? list[0] : list;
      })(),
      credentials: true,
    })

  );

  /**
   * =========================================
   * REQUEST ID
   * =========================================
   */

  app.use(

    (
      req,
      res,
      next
    ) => {

      req.request_id =

        crypto.randomUUID();

      res.setHeader(

        "x-request-id",

        req.request_id

      );

      next();

    }

  );

  /**
   * =========================================
   * BODY PARSER
   * =========================================
   */

  app.use(

    express.json({

      limit: "10mb",

    })

  );

  app.use(

    express.urlencoded({

      extended: true,

      limit: "10mb",

    })

  );

  /**
   * =========================================
   * LOGGER
   * =========================================
   */

  app.use(
    apiLogger
  );

  /**
   * =========================================
   * RATE LIMITER
   * =========================================
   */

  app.use(
    globalLimiter
  );

  return app;

}

module.exports = {

  createExpressApp,

};
const rateLimit =
  require(
    "express-rate-limit"
  );

/**
 * ============================================
 * GLOBAL API LIMIT
 * ============================================
 */

const globalLimiter =
  rateLimit({

    windowMs:
      60 * 1000,

    max: 300,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {

      success: false,

      message:
        "Quá nhiều request, thử lại sau",

    },

  });

/**
 * ============================================
 * GAME SCORE LIMIT
 * ============================================
 */

const gameScoreLimiter =
  rateLimit({

    windowMs:
      10 * 1000,

    max: 10,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {

      success: false,

      message:
        "Spam score detected",

    },

  });

/**
 * ============================================
 * SPIN LIMIT
 * ============================================
 */

const spinLimiter =
  rateLimit({

    windowMs:
      15 * 1000,

    max: 3,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {

      success: false,

      message:
        "Spin quá nhanh",

    },

  });

module.exports = {

  globalLimiter,

  gameScoreLimiter,

  spinLimiter,

};
const {

  formatLog,

} = require(
  "./loggerFormatter"
);

/**
 * ============================================
 * BASE LOGGER
 * ============================================
 */

function writeLog({

  level,

  message,

  metadata = {},

}) {

  const payload =
    formatLog({

      level,

      message,

      metadata,

    });

  /**
   * ============================================
   * ERROR
   * ============================================
   */

  if (level === "error") {

    console.error(
      JSON.stringify(
        payload,
        null,
        2
      )
    );

    return;

  }

  /**
   * ============================================
   * WARN
   * ============================================
   */

  if (level === "warn") {

    console.warn(
      JSON.stringify(
        payload,
        null,
        2
      )
    );

    return;

  }

  /**
   * ============================================
   * INFO
   * ============================================
   */

  console.log(
    JSON.stringify(
      payload,
      null,
      2
    )
  );

}

/**
 * ============================================
 * LOGGER API
 * ============================================
 */

module.exports = {

  info(
    message,
    metadata = {}
  ) {

    writeLog({

      level: "info",

      message,

      metadata,

    });

  },

  warn(
    message,
    metadata = {}
  ) {

    writeLog({

      level: "warn",

      message,

      metadata,

    });

  },

  error(
    message,
    metadata = {}
  ) {

    writeLog({

      level: "error",

      message,

      metadata,

    });

  },

};
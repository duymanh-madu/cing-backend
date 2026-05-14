const {
  getTraceContext,
} = require(
  "./infrastructure/tracing/traceContextService"
);

/**
 * =====================================================
 * SAFE SERIALIZER
 * =====================================================
 */

function safeSerialize(
  value
) {
  try {
    return JSON.parse(
      JSON.stringify(
        value
      )
    );
  } catch {
    return {
      serialization_error: true,
    };
  }
}

/**
 * =====================================================
 * NORMALIZE ERROR
 * =====================================================
 */

function normalizeError(
  error
) {
  if (
    !error ||
    !(error instanceof Error)
  ) {
    return error;
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

/**
 * =====================================================
 * NORMALIZE METADATA
 * =====================================================
 */

function normalizeMetadata(
  metadata = {}
) {
  const normalized = {
    ...metadata,
  };

  /**
   * ============================================
   * NORMALIZE ERROR FIELD
   * ============================================
   */

  if (normalized.error) {
    normalized.error =
      normalizeError(
        normalized.error
      );
  }

  return safeSerialize(
    normalized
  );
}

/**
 * =====================================================
 * CREATE LOG PAYLOAD
 * =====================================================
 */

function createLogPayload({
  level,
  message,
  metadata = {},
}) {
  return {
    level,

    message,

    timestamp:
      new Date().toISOString(),

    environment:
      process.env.NODE_ENV ||
      "development",

    trace:
      getTraceContext(),

    metadata:
      normalizeMetadata(
        metadata
      ),
  };
}

/**
 * =====================================================
 * WRITE LOG
 * =====================================================
 */

function writeLog({
  level,
  message,
  metadata = {},
}) {
  const payload =
    createLogPayload({
      level,
      message,
      metadata,
    });

  const output =
    JSON.stringify(
      payload,
      null,
      2
    );

  /**
   * ============================================
   * ERROR
   * ============================================
   */

  if (level === "error") {
    console.error(output);
    return;
  }

  /**
   * ============================================
   * WARN
   * ============================================
   */

  if (level === "warn") {
    console.warn(output);
    return;
  }

  /**
   * ============================================
   * INFO
   * ============================================
   */

  console.log(output);
}

/**
 * =====================================================
 * LOGGER API
 * =====================================================
 */

function info(
  message,
  metadata = {}
) {
  writeLog({
    level: "info",
    message,
    metadata,
  });
}

function warn(
  message,
  metadata = {}
) {
  writeLog({
    level: "warn",
    message,
    metadata,
  });
}

function error(
  message,
  metadata = {}
) {
  writeLog({
    level: "error",
    message,
    metadata,
  });
}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {
  info,
  warn,
  error,
};
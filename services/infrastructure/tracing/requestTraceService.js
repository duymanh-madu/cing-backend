const crypto =
  require("crypto");

/**
 * =====================================================
 * CREATE REQUEST ID
 * =====================================================
 */

function createRequestId() {

  return crypto.randomUUID();

}

/**
 * =====================================================
 * CREATE TRACE ID
 * =====================================================
 */

function createTraceId() {

  return crypto.randomUUID();

}

/**
 * =====================================================
 * CREATE CORRELATION ID
 * =====================================================
 */

function createCorrelationId() {

  return crypto.randomUUID();

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  createRequestId,

  createTraceId,

  createCorrelationId,

};
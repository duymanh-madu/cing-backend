/**
 * =====================================================
 * AUTH CONSTANTS
 * =====================================================
 */

const AUTH_CONSTANTS = {

  ACCESS_TOKEN_EXPIRES:
    "7d",

  REFRESH_TOKEN_EXPIRES:
    "30d",

  SESSION_TTL:
    1000 *
    60 *
    60 *
    24 *
    30,

};

module.exports =
  AUTH_CONSTANTS;
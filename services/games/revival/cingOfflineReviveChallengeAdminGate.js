"use strict";

/*
 * CING GAME CENTER V2
 *
 * Role gate for Daily Challenge
 * administrative mutations.
 *
 * Authentication must run first through
 * the existing verifyAdmin middleware.
 *
 * This module does not read or mutate DB.
 */

function requireChallengeSuperAdmin(
  req,
  res,
  next
) {
  if (
    !req.admin ||
    req.admin.role !== "super_admin"
  ) {
    return res.status(403).json({
      success: false,
      code:
        "CHALLENGE_SUPER_ADMIN_REQUIRED",
    });
  }

  return next();
}

module.exports = {
  requireChallengeSuperAdmin,
};

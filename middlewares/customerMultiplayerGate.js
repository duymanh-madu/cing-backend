"use strict";

const supabase = require("../supabase");

/**
 * Customer Multiplayer Legal Gate
 *
 * Fail closed:
 * - only explicit TRUE enables customer multiplayer.
 * - missing config / database failure keeps multiplayer unavailable.
 *
 * This gate intentionally affects only routes on which it is mounted.
 * Offline gamification routes are untouched.
 */
async function customerMultiplayerGate(req, res, next) {
  try {
    const { data, error } = await supabase
      .from("app_configs")
      .select("customer_multiplayer_enabled")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data?.customer_multiplayer_enabled === true) {
      return next();
    }

    return res.status(503).json({
      success: false,
      code: "CUSTOMER_MULTIPLAYER_TEMPORARILY_UNAVAILABLE",
      message: "Tính năng thi đấu nhiều người chơi hiện đang tạm ngưng.",
    });
  } catch (error) {
    console.warn(
      "[CUSTOMER_MULTIPLAYER_GATE] fail-closed:",
      error?.message || error
    );

    return res.status(503).json({
      success: false,
      code: "CUSTOMER_MULTIPLAYER_TEMPORARILY_UNAVAILABLE",
      message: "Tính năng thi đấu nhiều người chơi hiện đang tạm ngưng.",
    });
  }
}

module.exports = customerMultiplayerGate;

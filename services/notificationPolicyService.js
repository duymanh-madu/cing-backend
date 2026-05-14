const supabase =
  require("../supabase");

/**
 * ============================================
 * GET POLICY
 * ============================================
 */

async function getNotificationPolicy(
  notification_type
) {

  const {
    data,
    error,
  } = await supabase

    .from(
      "notification_policies"
    )

    .select("*")

    .eq(
      "notification_type",
      notification_type
    )

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

/**
 * ============================================
 * CHECK ENABLED
 * ============================================
 */

function isPolicyEnabled(
  policy
) {

  if (!policy) {

    return false;

  }

  return policy.enabled === true;

}

/**
 * ============================================
 * CHECK QUIET HOURS
 * ============================================
 */

function isQuietHours(
  policy
) {

  if (
    !policy ||
    !policy.quiet_hours_enabled
  ) {

    return false;

  }

  const now =
    new Date();

  const currentHour =
    now.getHours();

  const startHour =
    Number(
      policy.quiet_start
        .split(":")[0]
    );

  const endHour =
    Number(
      policy.quiet_end
        .split(":")[0]
    );

  /**
   * CROSS MIDNIGHT
   */

  if (
    startHour > endHour
  ) {

    return (
      currentHour >=
        startHour ||

      currentHour <
        endHour
    );

  }

  return (
    currentHour >=
      startHour &&

    currentHour <
      endHour
  );

}

/**
 * ============================================
 * CHECK COOLDOWN
 * ============================================
 */

async function isCooldownActive({

  user_id,

  notification_type,

  policy,

}) {

  /**
   * DISABLED
   */

  if (
    !policy ||
    !policy.cooldown_enabled
  ) {

    return false;

  }

  const cooldownMinutes =

    Number(
      policy.cooldown_minutes || 0
    );

  const maxPerCooldown =

    Number(
      policy.max_per_cooldown || 1
    );

  /**
   * TIME RANGE
   */

  const since =
    new Date(
      Date.now() -
      cooldownMinutes *
      60 *
      1000
    ).toISOString();

  /**
   * COUNT
   */

  const {
    count,
    error,
  } = await supabase

    .from("notifications")

    .select("*", {

      count: "exact",

      head: true,

    })

    .eq(
      "user_id",
      user_id
    )

    .eq(
      "notification_type",
      notification_type
    )

    .gte(
      "created_at",
      since
    );

  if (error) {

    throw new Error(
      error.message
    );

  }

  return (
    Number(count || 0) >=
    maxPerCooldown
  );

}

module.exports = {

  getNotificationPolicy,

  isPolicyEnabled,

  isQuietHours,

  isCooldownActive,

};
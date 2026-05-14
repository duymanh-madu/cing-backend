const supabase =
  require("../supabase");

/**
 * =====================================================
 * GET PLAYER PROFILE
 * =====================================================
 */

async function getPlayerProfile(
  userId
) {

  const {
    data: player,
    error: playerError,
  } = await supabase

    .from("players")

    .select("*")

    .eq(
      "user_id",
      userId
    )

    .maybeSingle();

  if (playerError) {
    throw playerError;
  }

  const {
    data: vouchers,
    error: voucherError,
  } = await supabase

    .from("user_vouchers")

    .select(`
      *,
      vouchers (
        id,
        title,
        description,
        image,
        discount_type,
        discount_value
      )
    `)

    .eq(
      "user_id",
      userId
    )

    .order("id", {
      ascending: false,
    });

  if (voucherError) {
    throw voucherError;
  }

  return {

    player:
      player || null,

    vouchers:
      vouchers || [],

  };

}

/**
 * =====================================================
 * REGISTER PLAYER
 * =====================================================
 */

async function registerPlayer({
  user_id,
  name,
  avatar,
}) {

  /**
   * CHECK EXISTING
   */

  const {
    data: existingPlayer,
  } = await supabase

    .from("players")

    .select("*")

    .eq(
      "user_id",
      user_id
    )

    .maybeSingle();

  /**
   * EXISTS
   */

  if (existingPlayer) {

    return {

      player:
        existingPlayer,

      created: false,

    };

  }

  /**
   * CREATE
   */

  const {
    data,
    error,
  } = await supabase

    .from("players")

    .insert({

      user_id,

      name:
        name || "Member",

      avatar:
        avatar || "",

      level:
        "Mới",

      total_spent: 0,

      total_orders: 0,

      game_plays: 0,

    })

    .select()

    .single();

  if (error) {
    throw error;
  }

  /**
   * ANALYTICS
   */

  await supabase

    .from(
      "analytics_events"
    )

    .insert({

      event_name:
        "register_player",

      user_id,

      event_data: {

        name,

      },

    });

  return {

    player: data,

    created: true,

  };

}

module.exports = {

  getPlayerProfile,

  registerPlayer,

};
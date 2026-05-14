const supabase =
  require("../supabase");

const {

  generateAccessToken,

} = require(
  "./tokenService"
);

/**
 * ============================================
 * LOGIN
 * ============================================
 */

async function login({

  zalo_user_id,

  display_name,

  avatar,

}) {

  /**
   * ============================================
   * FIND PLAYER
   * ============================================
   */

  let {

    data: player,

  } = await supabase

    .from("players")

    .select("*")

    .eq(
      "zalo_user_id",
      zalo_user_id
    )

    .maybeSingle();

  /**
   * ============================================
   * CREATE PLAYER
   * ============================================
   */

  if (!player) {

    const {

      data: createdPlayer,

      error,

    } = await supabase

      .from("players")

      .insert({

        zalo_user_id,

        display_name,

        avatar,

        member_activated:
          false,

        created_at:
          new Date(),

      })

      .select("*")

      .maybeSingle();

    if (error) {

      throw new Error(
        error.message
      );

    }

    player =
      createdPlayer;

  }

  /**
   * ============================================
   * TOKEN
   * ============================================
   */

  const access_token =

    generateAccessToken({

      user_id:
        player.id,

      role:
        player.role ||
        "user",

    });

  return {

    success: true,

    access_token,

    player,

  };

}

module.exports = {

  login,

};
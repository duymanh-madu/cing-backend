const axios =
  require("axios");

/**
 * ============================================
 * ENV
 * ============================================
 */

const IPOS_BASE_URL =
  process.env.IPOS_BASE_URL;

const IPOS_ACCESS_TOKEN =
  process.env.IPOS_ACCESS_TOKEN;

/**
 * ============================================
 * SYNC MEMBER TO IPOS
 * ============================================
 */

async function syncMemberToIPOS({

  player,

}) {

  try {

    if (!player) {

      throw new Error(
        "Missing player"
      );

    }

    if (!player.phone_number) {

      throw new Error(
        "Missing phone_number"
      );

    }

    const payload = {

      full_name:
        player.zalo_name,

      phone_number:
        player.phone_number,

      avatar:
        player.zalo_avatar,

      external_id:
        player.zalo_user_id,

      member_level:
        player.vip_level,

      total_spending:
        player.total_spending || 0,

    };

    const response =

      await axios.post(

        `${IPOS_BASE_URL}/customers/create-or-update`,

        payload,

        {

          headers: {

            Authorization:
              `Bearer ${IPOS_ACCESS_TOKEN}`,

            "Content-Type":
              "application/json",

          },

          timeout: 15000,

        }

      );

    return {

      success: true,

      response:
        response.data,

    };

  } catch (error) {

    console.error(
      "syncMemberToIPOS error:",
      error.message
    );

    return {

      success: false,

      error:
        error.message,

    };

  }

}

/**
 * ============================================
 * EXPORTS
 * ============================================
 */

module.exports = {

  syncMemberToIPOS,

};
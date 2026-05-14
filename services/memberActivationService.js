const supabase =
  require("../supabase");

const {

  verifyPhonePermission,

} = require(
  "./zaloPhoneService"
);

const {

  verifyOAFollow,

} = require(
  "./zaloOaService"
);

const {

  syncMemberToIPOS,

} = require(
  "./iposMemberService"
);

/**
 * ============================================
 * ACTIVATE MEMBER
 * ============================================
 */

async function activateMember({

  user_id,

  zalo_user_id,

  phone_number,

}) {

  /**
   * ============================================
   * PHONE VERIFY
   * ============================================
   */

  const phoneResult =

    await verifyPhonePermission({

      phone_number,

    });

  if (
    !phoneResult.success
  ) {

    throw new Error(

      phoneResult.message

    );

  }

  /**
   * ============================================
   * OA FOLLOW
   * ============================================
   */

  const oaResult =

    await verifyOAFollow({

      zalo_user_id,

    });

  if (
    !oaResult.followed
  ) {

    throw new Error(
      "OA follow required"
    );

  }

  /**
   * ============================================
   * UPDATE PLAYER
   * ============================================
   */

  const {

    data: player,

    error,

  } = await supabase

    .from("players")

    .update({

      member_activated:
        true,

      phone_number,

      zalo_user_id,

      updated_at:
        new Date(),

    })

    .eq(
      "id",
      user_id
    )

    .select("*")

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  /**
   * ============================================
   * CRM SYNC
   * ============================================
   */

  let crm_result =
    null;

  try {

    crm_result =

      await syncMemberToIPOS({

        player,

      });

  } catch (crmError) {

    console.error(

      "CRM sync error:",

      crmError.message

    );

  }

  return {

    success: true,

    player,

    crm_result,

  };

}

module.exports = {

  activateMember,

};
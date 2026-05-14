const supabase =
  require("../supabase");

/**
 * ============================================
 * GET MEMBER FROM IPOS CRM
 * ============================================
 */

async function getCRMMember(
  member_code
) {

  /**
   * TODO:
   * CALL IPOS CRM API
   */

  return {

    member_code,

    member_name:
      "Demo Member",

    member_tier:
      "Gold",

    total_spent:
      3500000,

    total_orders:
      42,

  };

}

/**
 * ============================================
 * SYNC MEMBER PROFILE
 * ============================================
 */

async function syncCRMMember(
  user_id,
  member_code
) {

  /**
   * GET CRM DATA
   */

  const crmData =
    await getCRMMember(
      member_code
    );

  /**
   * UPDATE PLAYER
   */

  const {
    data,
    error,
  } = await supabase

    .from("players")

    .update({

      crm_member_code:
        crmData.member_code,

      crm_tier:
        crmData.member_tier,

      total_spent_all_time:
        crmData.total_spent,

      total_orders:
        crmData.total_orders,

      updated_at:
        new Date(),

    })

    .eq(
      "user_id",
      user_id
    )

    .select()

    .single();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

module.exports = {

  getCRMMember,

  syncCRMMember,

};
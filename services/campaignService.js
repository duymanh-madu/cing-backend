const supabase =
  require("../supabase");

/**
 * ============================================
 * UPDATE CAMPAIGN SPENDING
 * ============================================
 */

async function updateCampaignSpending({

  campaign_key,

  user_id,

  player_name,

  total_amount,

}) {

  /**
   * ============================================
   * VALIDATE
   * ============================================
   */

  if (

    !campaign_key ||
    !user_id

  ) {

    throw new Error(
      "Missing campaign data"
    );

  }

  /**
   * ============================================
   * GET EXISTING
   * ============================================
   */

  const {
    data: existing,
    error: existingError,
  } = await supabase

    .from(
      "campaign_spending"
    )

    .select("*")

    .eq(
      "campaign_key",
      campaign_key
    )

    .eq(
      "user_id",
      user_id
    )

    .maybeSingle();

  if (existingError) {

    throw new Error(
      existingError.message
    );

  }

  /**
   * ============================================
   * UPDATE EXISTING
   * ============================================
   */

  if (existing) {

    const updatedSpent =

      Number(
        existing.total_spent || 0
      ) +

      Number(
        total_amount || 0
      );

    const updatedOrders =

      Number(
        existing.total_orders || 0
      ) + 1;

    const {
      error: updateError,
    } = await supabase

      .from(
        "campaign_spending"
      )

      .update({

        player_name,

        total_spent:
          updatedSpent,

        total_orders:
          updatedOrders,

        updated_at:
          new Date(),

      })

      .eq(
        "id",
        existing.id
      );

    if (updateError) {

      throw new Error(
        updateError.message
      );

    }

  } else {

    /**
     * ============================================
     * INSERT NEW
     * ============================================
     */

    const {
      error: insertError,
    } = await supabase

      .from(
        "campaign_spending"
      )

      .insert({

        campaign_key,

        user_id,

        player_name,

        total_spent:

          Number(
            total_amount || 0
          ),

        total_orders: 1,

        created_at:
          new Date(),

      });

    if (insertError) {

      throw new Error(
        insertError.message
      );

    }

  }

  /**
   * ============================================
   * REFRESH REALTIME CACHE
   * ============================================
   */

  await refreshCampaignCache(
    campaign_key
  );

  return true;

}

/**
 * ============================================
 * GET CAMPAIGN LEADERBOARD
 * ============================================
 */

async function getCampaignTop(

  campaign_key

) {

  const {
    data,
    error,
  } = await supabase

    .from(
      "campaign_spending"
    )

    .select("*")

    .eq(
      "campaign_key",
      campaign_key
    )

    .order(
      "total_spent",
      {
        ascending: false,
      }
    )

    .limit(50);

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data || [];

}

/**
 * ============================================
 * GET CAMPAIGN CONFIG
 * ============================================
 */

async function getCampaignConfig(

  campaign_key

) {

  const {
    data,
    error,
  } = await supabase

    .from(
      "campaign_configs"
    )

    .select("*")

    .eq(
      "campaign_key",
      campaign_key
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
 * REFRESH CAMPAIGN CACHE
 * ============================================
 */

async function refreshCampaignCache(

  campaign_key

) {

  /**
   * ============================================
   * GET LEADERBOARD
   * ============================================
   */

  const leaderboard =
    await getCampaignTop(
      campaign_key
    );

  /**
   * ============================================
   * UPSERT CACHE
   * ============================================
   */

  const {
    error,
  } = await supabase

    .from(
      "campaign_cache"
    )

    .upsert(

      {

        campaign_key,

        leaderboard,

        updated_at:
          new Date(),

      },

      {

        onConflict:
          "campaign_key",

      }

    );

  if (error) {

    throw new Error(
      error.message
    );

  }

  return leaderboard;

}

/**
 * ============================================
 * GET CAMPAIGN CACHE
 * ============================================
 */

async function getCampaignCache(

  campaign_key

) {

  const {
    data,
    error,
  } = await supabase

    .from(
      "campaign_cache"
    )

    .select("*")

    .eq(
      "campaign_key",
      campaign_key
    )

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

module.exports = {

  updateCampaignSpending,

  getCampaignTop,

  getCampaignConfig,

  refreshCampaignCache,

  getCampaignCache,

};
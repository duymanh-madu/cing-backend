const supabase =
  require("../supabase");

/**
 * =========================================
 * GET PLAYER LEVEL
 * =========================================
 */

async function getPlayerLevel(
  user_id
) {

  let {
    data,
    error,
  } = await supabase

    .from("player_levels")

    .select("*")

    .eq(
      "user_id",
      user_id
    )

    .maybeSingle();

  if (!data) {

    const created = await supabase

      .from("player_levels")

      .insert({

        user_id,

      })

      .select()

      .single();

    data = created.data;

  }

  return data;

}

/**
 * =========================================
 * CALCULATE LEVEL
 * =========================================
 */

function calculateLevel(
  exp
) {

  if (exp >= 1500)
    return 5;

  if (exp >= 700)
    return 4;

  if (exp >= 300)
    return 3;

  if (exp >= 100)
    return 2;

  return 1;

}

/**
 * =========================================
 * CALCULATE VIP
 * =========================================
 */

function calculateVipRank(
  total_spent
) {

  if (total_spent >= 5000000)
    return "Diamond";

  if (total_spent >= 2000000)
    return "Gold";

  if (total_spent >= 500000)
    return "Silver";

  return "Bronze";

}

/**
 * =========================================
 * ADD EXP
 * =========================================
 */

async function addExp(
  user_id,
  expAmount
) {

  const player =
    await getPlayerLevel(
      user_id
    );

  const newExp =
    Number(player.exp || 0) +
    Number(expAmount || 0);

  const newLevel =
    calculateLevel(
      newExp
    );

  const {
    data,
    error,
  } = await supabase

    .from("player_levels")

    .update({

      exp: newExp,

      level: newLevel,

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
    throw error;
  }

  return data;

}

/**
 * =========================================
 * UPDATE SPENDING
 * =========================================
 */

async function updateSpending(
  user_id,
  amount
) {

  const player =
    await getPlayerLevel(
      user_id
    );

  const totalSpent =

    Number(
      player.total_spent || 0
    ) + Number(amount || 0);

  const totalOrders =

    Number(
      player.total_orders || 0
    ) + 1;

  const vipRank =
    calculateVipRank(
      totalSpent
    );

  const {
    data,
    error,
  } = await supabase

    .from("player_levels")

    .update({

      total_spent:
        totalSpent,

      total_orders:
        totalOrders,

      vip_rank:
        vipRank,

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
    throw error;
  }

  return data;

}

module.exports = {

  getPlayerLevel,

  addExp,

  updateSpending,

};
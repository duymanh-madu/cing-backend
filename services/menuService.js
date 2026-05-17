const supabase =
  require("../supabase");

/**
 * ============================================
 * GET MENU
 * ============================================
 */

async function getMenu() {

  const {

    data,
    error,

  } = await supabase

    .from("menu_items")

    .select("*")

    .eq(
      "active",
      true
    );

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data || [];

}

module.exports = {

  getMenu,

};
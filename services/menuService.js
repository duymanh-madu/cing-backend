const supabase =
  require("../supabase");

/**
 * =====================================================
 * GET MENU
 * =====================================================
 */

async function getMenu() {

  try {

    /**
     * =================================================
     * QUERY
     * =================================================
     */

    const {
      data,
      error,
    } = await supabase

      .from("menu_items")

      .select("*");

    /**
     * =================================================
     * ERROR
     * =================================================
     */

    if (error) {

      console.error(
        "MENU QUERY ERROR:",
        error
      );

      throw new Error(
        error.message
      );

    }

    /**
     * =================================================
     * EMPTY
     * =================================================
     */

    if (
      !data ||
      !Array.isArray(data)
    ) {

      return [];

    }

    /**
     * =================================================
     * FILTER ACTIVE
     * =================================================
     */

    const filtered =
      data.filter(
        (item) => {

          return (
            item.active === true ||
            item.is_active === true ||
            item.available === true ||
            item.active === 1 ||
            item.is_active === 1 ||
            item.available === 1 ||
            item.active === null ||
            item.active === undefined
          );

        }
      );

    /**
     * =================================================
     * NORMALIZE
     * =================================================
     */

    const normalized =
      filtered.map(
        (item, index) => ({

          id:
            item.id ||
            index + 1,

          item_id:
            item.item_id ||
            null,

          name:
            item.name ||
            "Unnamed Item",

          description:
            item.description ||
            "",

          category:
            item.category ||
            item.category_name ||
            "OTHER",

          image:
            item.image ||
            item.thumbnail ||
            "",

          price:
            Number(
              item.price || 0
            ),

          original_price:
            Number(
              item.original_price || 0
            ),

          active:
            true,

        })
      );

    /**
     * =================================================
     * RETURN
     * =================================================
     */

    return normalized;

  } catch (
    error
  ) {

    console.error(
      "GET MENU SERVICE ERROR:",
      error
    );

    throw error;

  }

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  getMenu,

};
const supabase =
  require("../supabase");

const {
  getMenu,
} = require("./foodbook");

/**
 * =====================================================
 * SYNC MENU TO SUPABASE
 * =====================================================
 */

async function syncMenuToSupabase() {

  try {

    console.log(
      "🚀 START MENU SYNC..."
    );

    /**
     * GET MENU
     */

    const menu =
      await getMenu();

    if (
      !menu ||
      menu.length === 0
    ) {

      console.log(
        "❌ EMPTY MENU"
      );

      return;

    }

    /**
     * UPSERT PAYLOAD
     */

    const payload =
      menu.map(
        (item) => ({

          foodbook_id:
            String(
              item.foodbook_id
            ),

          store_item_id:
            item.id,

          name:
            item.name,

          category:
            item.category,

          price:
            item.price,

          image:
            item.image,

          description:
            item.description,

          active:
            item.active,

          featured:
            item.featured,

          raw_data:
            item.raw,

          updated_at:
            new Date(),

        })
      );

    /**
     * UPSERT
     */

    const {
      error,
    } = await supabase

      .from(
        "menu_items"
      )

      .upsert(
        payload,
        {

          onConflict:
            "foodbook_id",

        }
      );

    if (error) {

      console.log(
        "❌ MENU UPSERT ERROR"
      );

      console.log(
        error
      );

      return;

    }

    console.log(

      `✅ MENU SYNCED: ${payload.length} ITEMS`

    );

  } catch (error) {

    console.log(
      "❌ SYNC ENGINE ERROR"
    );

    console.log(
      error
    );

  }

}

module.exports = {

  syncMenuToSupabase,

};
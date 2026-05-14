const axios =
  require("axios");

const supabase =
  require("../supabase");

/**
 * ============================================
 * SYNC MENU FROM IPOS
 * ============================================
 */

async function syncMenuFromIPOS() {

  const response =
    await axios.get(

      `${process.env.IPOS_BASE_URL}/items`,

      {

        headers: {

          Authorization:

            `Bearer ${process.env.IPOS_ACCESS_TOKEN}`,

        },

        params: {

          pos_parent:

            process.env
              .IPOS_POS_PARENT,

          pos_id:

            process.env
              .IPOS_POS_ID,

        },

      }

    );

  const items =

    response.data?.data ||

    [];

  for (const item of items) {

    await supabase

      .from("menu_items")

      .upsert({

        item_id:
          item.id,

        item_name:
          item.name,

        price:
          item.price,

        image:
          item.image,

        is_active:
          true,

        updated_at:
          new Date(),

      });

  }

  return {

    success: true,

    synced:
      items.length,

  };

}

module.exports = {

  syncMenuFromIPOS,

};
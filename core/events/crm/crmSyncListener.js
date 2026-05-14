const eventBus =
  require(
    "../eventBus"
  );

const supabase =
  require(
    "../../../supabase"
  );

eventBus.register(

  "crm.order.synced",

  async ({
    order_id,
    success,
    error = null,
  }) => {

    await supabase

      .from("orders")

      .update({

        crm_sync_status:

          success
            ? "synced"
            : "failed",

        crm_sync_error:
          error,

        crm_last_synced_at:
          new Date(),

      })

      .eq(
        "id",
        order_id
      );

  }

);
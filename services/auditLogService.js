const supabase =
  require("../supabase");

async function createAuditLog({

  action,

  actor_id = null,

  entity_type,

  entity_id = null,

  metadata = {},

}) {

  try {

    await supabase

      .from("audit_logs")

      .insert({

        action,

        actor_id,

        entity_type,

        entity_id,

        metadata,

        created_at:
          new Date(),

      });

  } catch (error) {

    console.error(

      "createAuditLog error:",

      error.message

    );

  }

}

module.exports = {

  createAuditLog,

};
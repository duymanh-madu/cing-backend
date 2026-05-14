const supabase =
  require("../supabase");

async function logAdminAction({

  admin_id,
  admin_username,

  action,

  target_type,
  target_id,

  metadata = {},

}) {

  try {

    await supabase

      .from("admin_logs")

      .insert({

        admin_id,

        admin_username,

        action,

        target_type,

        target_id,

        metadata,

      });

  } catch (error) {

    console.log(
      "ADMIN LOG ERROR",
      error.message
    );

  }

}

module.exports = {

  logAdminAction,

};
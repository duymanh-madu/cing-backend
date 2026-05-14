const supabase =
  require("../../../supabase");

async function checkDatabaseHealth() {

  try {

    const {

      error,

    } = await supabase

      .from("app_configs")

      .select("id")

      .limit(1);

    return {

      service:
        "database",

      healthy:
        !error,

    };

  } catch {

    return {

      service:
        "database",

      healthy:
        false,

    };

  }

}

module.exports = {

  checkDatabaseHealth,

};
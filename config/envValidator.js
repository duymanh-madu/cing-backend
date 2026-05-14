const requiredEnvs = [

  "SUPABASE_URL",

  "SUPABASE_SERVICE_ROLE_KEY",

];

function validateEnv() {

  const missing =

    requiredEnvs.filter(

      (
        key
      ) => !process.env[key]

    );

  if (
    missing.length > 0
  ) {

    throw new Error(

      `Missing ENV: ${missing.join(", ")}`

    );

  }

}

module.exports = {

  validateEnv,

};
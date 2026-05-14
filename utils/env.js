const requiredEnv = [

  "SUPABASE_URL",

  "SUPABASE_SERVICE_ROLE_KEY",

];

function validateEnv() {

  const missing = [];

  for (const key of requiredEnv) {

    if (!process.env[key]) {

      missing.push(key);

    }

  }

  if (missing.length > 0) {

    throw new Error(

      `Missing ENV: ${missing.join(", ")}`

    );

  }

}

module.exports = {

  validateEnv,

};
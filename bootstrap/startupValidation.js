const {
  validateEnv,
} = require(
  "../utils/env"
);

async function startupValidation() {

  /**
   * ENV
   */

  validateEnv();

  console.log(
    "✅ ENV validated"
  );

}

module.exports = {

  startupValidation,

};
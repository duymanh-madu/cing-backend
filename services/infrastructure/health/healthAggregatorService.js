const {

  checkDatabaseHealth,

} = require(
  "./checkers/databaseHealthChecker"
);

const {

  checkCacheHealth,

} = require(
  "./checkers/cacheHealthChecker"
);

async function getSystemHealth() {

  const checks =

    await Promise.all([

      checkDatabaseHealth(),

      checkCacheHealth(),

    ]);

  return {

    success: true,

    services:
      checks,

    timestamp:
      new Date(),

  };

}

module.exports = {

  getSystemHealth,

};
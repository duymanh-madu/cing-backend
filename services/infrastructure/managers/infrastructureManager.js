const cacheManager =
  require(
    "../cache/cacheManager"
  );

const queueManager =
  require(
    "../queue/queueManager"
  );

async function initializeInfrastructure() {

  console.log(

    "Infrastructure initialized"

  );

  await cacheManager.stats();

  await queueManager.getPendingJobs();

}

module.exports = {

  initializeInfrastructure,

};
const metrics =
  require("./metricsStore");

function getMetricsSnapshot() {

  return {

    ...metrics,

    timestamp:
      new Date(),

  };

}

module.exports = {

  getMetricsSnapshot,

};
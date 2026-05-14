const workers =
  {};

function registerWorker(
  workerName
) {

  workers[
    workerName
  ] = {

    status:
      "running",

    started_at:
      new Date(),

  };

}

function getWorkers() {

  return workers;

}

module.exports = {

  registerWorker,

  getWorkers,

};
const registry = {

  database: false,

  cache: false,

  queue: false,

  workers: false,

  sockets: false,

};

function setInfrastructureStatus(

  key,

  value

) {

  registry[key] =
    value;

}

function getInfrastructureStatus() {

  return registry;

}

module.exports = {

  setInfrastructureStatus,

  getInfrastructureStatus,

};
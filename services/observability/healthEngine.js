class HealthEngine {

  check(system) {

    return {
      payment: system.payment ? "OK" : "DOWN",
      crm: system.crm ? "OK" : "DOWN",
      sync: system.sync ? "OK" : "DOWN",
      timestamp: Date.now()
    };

  }

}

module.exports = new HealthEngine();

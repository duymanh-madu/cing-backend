const hook = require("./eventHook");

function wrapAsync(fn, name) {

  return async (...args) => {

    const start = Date.now();

    try {

      const res = await fn(...args);

      hook.recordLatency(Date.now() - start);

      if (name.includes("payment")) hook.recordPayment(true);
      if (name.includes("crm")) hook.recordCRM(true);

      return res;

    } catch (err) {

      hook.recordError();

      throw err;

    }
  };

}

module.exports = { wrapAsync };

const {

  getRetryPolicy,

} = require(
  "./retryPolicyService"
);

const {

  getBackoffDelay,

} = require(
  "./exponentialBackoffService"
);

async function executeRetry({

  operation,

  type =
    "default",

}) {

  const policy =

    getRetryPolicy({

      type,

    });

  let lastError =
    null;

  for (

    let attempt = 0;

    attempt <
    policy.retries;

    attempt++

  ) {

    try {

      return await operation();

    } catch (error) {

      lastError =
        error;

      const delay =

        getBackoffDelay({

          attempt,

          base_delay:

            policy.base_delay,

        });

      await new Promise(

        (resolve) =>

          setTimeout(

            resolve,

            delay

          )

      );

    }

  }

  throw lastError;

}

module.exports = {

  executeRetry,

};
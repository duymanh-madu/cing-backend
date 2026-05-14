const {

  shouldRetryEvent,

  getRetryDelay,

} = require(

  "./eventRetryPolicyService"

);

/**
 * =====================================================
 * EXECUTE EVENT RETRY
 * =====================================================
 */

async function executeEventRetry({

  operation,

  retryCount = 0,

}) {

  try {

    return await operation();

  } catch (error) {

    /**
     * ============================================
     * STOP RETRY
     * ============================================
     */

    if (

      !shouldRetryEvent({

        retryCount,

      })

    ) {

      throw error;

    }

    /**
     * ============================================
     * DELAY
     * ============================================
     */

    const delay =

      getRetryDelay(

        retryCount + 1

      );

    await new Promise(

      (resolve) =>

        setTimeout(

          resolve,

          delay

        )

    );

    /**
     * ============================================
     * RETRY AGAIN
     * ============================================
     */

    return executeEventRetry({

      operation,

      retryCount:

        retryCount + 1,

    });

  }

}

module.exports = {

  executeEventRetry,

};
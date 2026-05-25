const logger =
  require(
    "../../services/loggerService"
  );

const {

  getHomepageBlocks,

} = require(
  "../../services/cms/dynamicHomepageService"
);

const {

  getRuntimeContents,

} = require(
  "../../services/cms/runtimeContentService"
);

/**
 * =====================================================
 * START CMS RUNTIME WORKER
 * =====================================================
 */

async function startCmsRuntimePublishWorker() {

  logger.info(
    "[CMS] Runtime publish worker started"
  );

  setInterval(
    async () => {

      try {

        const homepage =
          getHomepageBlocks();

        const contents =
          getRuntimeContents();

        logger.info(
          "[CMS] Runtime published",
          {

            homepage_blocks:
              homepage.length,

            runtime_contents:
              contents.length,

          }
        );

      } catch (error) {

        logger.error(
          "[CMS] Runtime publish failed",
          {
            message:
              error.message,
          }
        );

      }

    },
    15000
  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  startCmsRuntimePublishWorker,

};
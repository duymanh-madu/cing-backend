const express =
  require("express");

const router =
  express.Router();

const {

  getDeadJobs,

} = require(

  "../services/deadLetterQueueService"

);

/**
 * ============================================
 * GET DEAD JOBS
 * ============================================
 */

router.get(

  "/",

  async (req, res) => {

    try {

      const jobs =

        await getDeadJobs();

      res.json({

        success: true,

        jobs,

      });

    } catch (error) {

      res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }

);

module.exports =
  router;
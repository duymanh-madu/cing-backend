module.exports = async (
  req,
  res
) => {

  try {

    res.json({

      success: true,

      queues: {

        notification_queue:
          "active",

        dead_queue:
          "active",

        voucher_scheduler:
          "active",

      },

      timestamp:
        new Date(),

    });

  } catch (error) {

    console.error(

      "queueStatsController error:",

      error.message

    );

    res.status(500).json({

      success: false,

      error:
        error.message,

    });

  }

};
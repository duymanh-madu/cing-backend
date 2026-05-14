module.exports = async (
  req,
  res
) => {

  try {

    res.json({

      success: true,

      service:
        "internal-health",

      uptime:
        process.uptime(),

      timestamp:
        new Date(),

    });

  } catch (error) {

    console.error(

      "internalHealthController error:",

      error.message

    );

    res.status(500).json({

      success: false,

      error:
        error.message,

    });

  }

};
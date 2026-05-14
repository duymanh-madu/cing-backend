module.exports = async (
  req,
  res
) => {

  try {

    const onlineUsers =

      global.onlineUsers;

    res.json({

      success: true,

      online_users:

        onlineUsers?.size || 0,

      timestamp:
        new Date(),

    });

  } catch (error) {

    console.error(

      "socketStatsController error:",

      error.message

    );

    res.status(500).json({

      success: false,

      error:
        error.message,

    });

  }

};
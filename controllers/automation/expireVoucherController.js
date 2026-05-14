module.exports = async (
  req,
  res
) => {

  try {

    res.json({

      success: true,

      action:
        "expire_voucher_placeholder",

    });

  } catch (error) {

    console.error(

      "expireVoucherController error:",

      error.message

    );

    res.status(500).json({

      success: false,

      error:
        error.message,

    });

  }

};
async function getMetrics(
  req,
  res
) {

  return res.json({

    success: true,

    metrics:
      getPaymentMetrics(),

  });

}

module.exports = {

  getMetrics,

};
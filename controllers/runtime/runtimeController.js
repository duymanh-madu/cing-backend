const runtimeService =
  require(
    "../../services/runtime/runtimeService"
  );

async function getRuntimeConfig(
  req,
  res,
  next
) {

  try {

    const data =
      await runtimeService
        .getRuntimeConfig();

    return res.json({
      success: true,
      data,
    });

  } catch (error) {

    next(error);

  }

}

async function getRuntimeFeatures(
  req,
  res,
  next
) {

  try {

    const data =
      await runtimeService
        .getRuntimeFeatures();

    return res.json({
      success: true,
      data,
    });

  } catch (error) {

    next(error);

  }

}

async function getRuntimeVersion(
  req,
  res,
  next
) {

  try {

    const data =
      await runtimeService
        .getRuntimeVersion();

    return res.json({
      success: true,
      data,
    });

  } catch (error) {

    next(error);

  }

}

async function getRuntimeMetrics(
  req,
  res,
  next
) {

  try {

    const data =
      await runtimeService
        .getRuntimeMetrics();

    return res.json({
      success: true,
      data,
    });

  } catch (error) {

    next(error);

  }

}

async function getSocketHealth(
  req,
  res,
  next
) {

  try {

    const data =
      await runtimeService
        .getSocketHealth();

    return res.json({
      success: true,
      data,
    });

  } catch (error) {

    next(error);

  }

}

module.exports = {

  getRuntimeConfig,
  getRuntimeFeatures,
  getRuntimeVersion,
  getRuntimeMetrics,
  getSocketHealth,

};
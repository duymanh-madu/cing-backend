const configRepository =
  require(
    "../repositories/cingArtilleryConfigRepository"
  );

function normalizeRuntimeConfig(
  rawConfig
) {
  const source =
    rawConfig &&
    typeof rawConfig === "object" &&
    !Array.isArray(rawConfig)
      ? rawConfig
      : {};

  return {
    version:
      Number.isInteger(
        Number(source.version)
      ) &&
      Number(source.version) > 0
        ? Number(source.version)
        : 1,

    enabled:
      source.enabled === true,
  };
}

async function getCingArtilleryRuntimeConfig() {
  const config =
    await configRepository
      .getRuntimeConfig();

  return normalizeRuntimeConfig(
    config
  );
}

async function isCingArtilleryEnabled() {
  const config =
    await getCingArtilleryRuntimeConfig();

  return config.enabled;
}

async function requireCingArtilleryEnabled() {
  const enabled =
    await isCingArtilleryEnabled();

  if (!enabled) {
    const error =
      new Error(
        "Cing Artillery hiện chưa được mở"
      );

    error.code =
      "CING_ARTILLERY_DISABLED";

    error.statusCode =
      503;

    throw error;
  }

  return true;
}

module.exports = {
  normalizeRuntimeConfig,
  getCingArtilleryRuntimeConfig,
  isCingArtilleryEnabled,
  requireCingArtilleryEnabled,
};

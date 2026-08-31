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

  const executionWorker =
    source.execution_worker &&
    typeof source.execution_worker === "object" &&
    !Array.isArray(
      source.execution_worker
    )
      ? source.execution_worker
      : {};

  const executionWorkerVersion =
    Number(
      executionWorker.version
    );

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

    execution_worker: {
      version:
        Number.isInteger(
          executionWorkerVersion
        ) &&
        executionWorkerVersion > 0
          ? executionWorkerVersion
          : 1,

      enabled:
        executionWorkerVersion === 1 &&
        executionWorker.enabled === true,
    },
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

async function isCingArtilleryExecutionWorkerEnabled() {
  const config =
    await getCingArtilleryRuntimeConfig();

  return (
    config.execution_worker.version === 1 &&
    config.execution_worker.enabled === true
  );
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
  isCingArtilleryExecutionWorkerEnabled,
  requireCingArtilleryEnabled,
};

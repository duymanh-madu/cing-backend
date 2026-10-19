"use strict";

/*
 * Cing KDS FABi Production Control-Proof Launcher V1
 *
 * This is deliberately a manual, single-run composition boundary.  It owns
 * no timer, route, server mount, cron, or background worker.  It accepts an
 * explicitly approved branch scope and returns redacted aggregate evidence
 * only; transaction identifiers and credentials never leave its dependencies.
 */

const {
  createFabiIposCredentialCompositionV1
} = require(
  "./cingKdsFabiIposCredentialCompositionV1"
);

const {
  createFabiC04DurableDbAdapterV1
} = require(
  "./cingKdsFabiC04DurableDbAdapterV1"
);

const {
  createFabiKdsRuntimeLeaseDbAdapterV1
} = require(
  "./cingKdsFabiRuntimeLeaseDbAdapterV1"
);

const {
  createFabiKdsReconciliationQueueDbAdapterV1
} = require(
  "./cingKdsFabiReconciliationQueueDbAdapterV1"
);

const {
  createFabiKdsDormantRuntimeCompositionV1
} = require(
  "./cingKdsFabiDormantRuntimeCompositionV1"
);

const RUN_CONFIRMATION =
  "CING_KDS_CONTROL_PROOF_RUN_ONCE_V1";

const MAX_RUN_DURATION_MS =
  110_000;

function launcherError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requiredFunction(value, code) {
  if (typeof value !== "function") {
    throw launcherError(code);
  }
  return value;
}

function requiredString(value, code) {
  if (typeof value !== "string" || !value.trim()) {
    throw launcherError(code);
  }
  return value.trim();
}

function validUuid(value, code) {
  const text = requiredString(value, code);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw launcherError(code);
  }
  return text;
}

function validateScope(scope) {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    throw launcherError("KDS_CONTROL_PROOF_SCOPE_INVALID");
  }

  return Object.freeze({
    company_uid: validUuid(scope.company_uid, "KDS_CONTROL_PROOF_COMPANY_INVALID"),
    brand_uid: validUuid(scope.brand_uid, "KDS_CONTROL_PROOF_BRAND_INVALID"),
    store_uid: validUuid(scope.store_uid, "KDS_CONTROL_PROOF_STORE_INVALID")
  });
}

function nowMs(value, code) {
  const out = Number(value);
  if (!Number.isSafeInteger(out) || out < 0) {
    throw launcherError(code);
  }
  return out;
}

function nonnegative(value) {
  const out = Number(value);
  return Number.isSafeInteger(out) && out >= 0 ? out : 0;
}

function safeCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]{3,120}$/.test(error.code)
    ? error.code
    : "KDS_CONTROL_PROOF_FAILED";
}

function createMetrics() {
  return {
    c03: { count: 0, timeout_count: 0, max_duration_ms: 0 },
    c04: { count: 0, timeout_count: 0, max_duration_ms: 0 }
  };
}

function createFabiKdsControlProofLauncherV1({
  approvedScope,
  configurationProvider,
  createSupabaseClient,
  requestFn,
  nowProvider = () => Date.now(),
  maxRunDurationMs = MAX_RUN_DURATION_MS,
  createCredentialComposition = createFabiIposCredentialCompositionV1,
  createDurableDbAdapter = createFabiC04DurableDbAdapterV1,
  createRuntimeLeaseAdapter = createFabiKdsRuntimeLeaseDbAdapterV1,
  createReconciliationQueueAdapter = createFabiKdsReconciliationQueueDbAdapterV1,
  createRuntimeComposition = createFabiKdsDormantRuntimeCompositionV1
} = {}) {
  const scope = validateScope(approvedScope);
  const loadConfiguration = requiredFunction(configurationProvider, "KDS_CONTROL_PROOF_CONFIGURATION_REQUIRED");
  const createClient = requiredFunction(createSupabaseClient, "KDS_CONTROL_PROOF_SUPABASE_FACTORY_REQUIRED");
  const transport = requiredFunction(requestFn, "KDS_CONTROL_PROOF_REQUEST_FN_REQUIRED");
  const clock = requiredFunction(nowProvider, "KDS_CONTROL_PROOF_NOW_PROVIDER_REQUIRED");
  const durationLimit = nowMs(maxRunDurationMs, "KDS_CONTROL_PROOF_DURATION_INVALID");

  if (durationLimit < 1_000 || durationLimit >= 120_000) {
    throw launcherError("KDS_CONTROL_PROOF_DURATION_INVALID");
  }

  for (const factory of [
    createCredentialComposition,
    createDurableDbAdapter,
    createRuntimeLeaseAdapter,
    createReconciliationQueueAdapter,
    createRuntimeComposition
  ]) {
    requiredFunction(factory, "KDS_CONTROL_PROOF_FACTORY_REQUIRED");
  }

  let started = false;

  async function runOnce({ confirmation } = {}) {
    if (started) {
      throw launcherError("KDS_CONTROL_PROOF_ALREADY_STARTED");
    }

    if (confirmation !== RUN_CONFIRMATION) {
      throw launcherError("KDS_CONTROL_PROOF_CONFIRMATION_REQUIRED");
    }

    started = true;
    const start = nowMs(await clock(), "KDS_CONTROL_PROOF_NOW_INVALID");
    const metrics = createMetrics();

    function elapsed() {
      return nowMs(clock(), "KDS_CONTROL_PROOF_NOW_INVALID") - start;
    }

    function guardDeadline() {
      if (elapsed() >= durationLimit) {
        throw launcherError("KDS_CONTROL_PROOF_DEADLINE_EXCEEDED");
      }
    }

    function classifyRequest(url) {
      return typeof url === "string" && url.includes("sale-change-log") ? "c04" : "c03";
    }

    async function boundedRequest(input) {
      guardDeadline();
      const kind = classifyRequest(input?.url);
      const requestStart = nowMs(clock(), "KDS_CONTROL_PROOF_NOW_INVALID");
      metrics[kind].count++;

      try {
        return await transport(input);
      } catch (error) {
        if (safeCode(error).endsWith("TIMEOUT")) {
          metrics[kind].timeout_count++;
        }
        throw error;
      } finally {
        metrics[kind].max_duration_ms = Math.max(
          metrics[kind].max_duration_ms,
          Math.max(0, nowMs(clock(), "KDS_CONTROL_PROOF_NOW_INVALID") - requestStart)
        );
      }
    }

    try {
      const config = await loadConfiguration();
      if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw launcherError("KDS_CONTROL_PROOF_CONFIGURATION_INVALID");
      }

      const frozenConfig = Object.freeze({
        SUPABASE_URL: requiredString(config.SUPABASE_URL, "KDS_CONTROL_PROOF_SUPABASE_URL_REQUIRED"),
        SUPABASE_SERVICE_ROLE_KEY: requiredString(config.SUPABASE_SERVICE_ROLE_KEY, "KDS_CONTROL_PROOF_SUPABASE_KEY_REQUIRED"),
        IPOS_TOKEN: requiredString(config.IPOS_TOKEN, "KDS_FABI_IPOS_AUTH_REQUIRED"),
        IPOS_ACCESS_TOKEN: requiredString(config.IPOS_ACCESS_TOKEN, "KDS_FABI_IPOS_APP_ACCESS_REQUIRED")
      });

      guardDeadline();
      const supabase = createClient(frozenConfig);
      if (!supabase || typeof supabase.rpc !== "function") {
        throw launcherError("KDS_CONTROL_PROOF_SUPABASE_CLIENT_INVALID");
      }

      const boundedSupabase = Object.freeze({
        rpc: async (...args) => {
          guardDeadline();
          return supabase.rpc(...args);
        }
      });

      const credentialComposition = createCredentialComposition({
        configurationProvider: async () => frozenConfig,
        requestFn: boundedRequest,
        requestTimeoutMs: 10_000,
        timezoneOffsetMs: 25_200_000
      });

      const runtime = createRuntimeComposition({
        scopeProvider: async () => scope,
        nowProvider: async () => nowMs(clock(), "KDS_CONTROL_PROOF_NOW_INVALID"),
        c04HttpClient: credentialComposition.c04HttpClient,
        c03HttpClient: credentialComposition.c03HttpClient,
        durableDbAdapter: createDurableDbAdapter({ supabase: boundedSupabase }),
        runtimeLeaseAdapter: createRuntimeLeaseAdapter({ supabase: boundedSupabase }),
        reconciliationQueueAdapter: createReconciliationQueueAdapter({ supabase: boundedSupabase }),
        c04MaxPages: 100,
        branchLeaseSeconds: 120,
        overlapMs: 60_000,
        settleLagMs: 5_000,
        maxAdvanceMs: 15 * 60_000,
        bootstrapLookbackMs: 15 * 60_000,
        pendingRetryDelaySeconds: 10,
        retryBatchSize: 1,
        retryLeaseSeconds: 120
      });

      guardDeadline();
      const result = await runtime.runOnce();
      const duration = elapsed();
      const runnerStatus =
        typeof result?.status === "string"
          ? result.status
          : "invalid";
      const completed =
        duration < 120_000 &&
        runnerStatus === "committed";

      return Object.freeze({
        status: completed ? "completed" : "hold",
        error_code: completed
          ? null
          : duration >= 120_000
            ? "KDS_CONTROL_PROOF_DEADLINE_EXCEEDED"
            : "KDS_CONTROL_PROOF_RUN_NOT_COMMITTED",
        duration_ms: duration,
        c03: Object.freeze({ ...metrics.c03 }),
        c04: Object.freeze({ ...metrics.c04 }),
        runner: Object.freeze({
          status: runnerStatus,
          polled: result?.polled === true,
          checkpoint_committed: result?.checkpoint_committed === true,
          transaction_count: nonnegative(result?.transaction_count),
          fetched_event_count: nonnegative(result?.fetched_event_count),
          durable_event_count: nonnegative(result?.durable_event_count),
          retries_claimed: nonnegative(result?.retries_claimed),
          retries_resolved: nonnegative(result?.retries_resolved)
        })
      });
    } catch (error) {
      return Object.freeze({
        status: "hold",
        error_code: safeCode(error),
        duration_ms: Math.max(0, elapsed()),
        c03: Object.freeze({ ...metrics.c03 }),
        c04: Object.freeze({ ...metrics.c04 }),
        runner: null
      });
    }
  }

  return Object.freeze({ runOnce });
}

module.exports = {
  RUN_CONFIRMATION,
  MAX_RUN_DURATION_MS,
  createFabiKdsControlProofLauncherV1
};

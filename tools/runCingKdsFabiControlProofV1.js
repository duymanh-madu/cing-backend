"use strict";

/*
 * Manual Production control-proof entrypoint.
 * It is not imported by server.js and starts no scheduler.
 * Its only output is the redacted aggregate returned by the launcher.
 */

require("dotenv").config();

const axios = require("axios");
const { createKdsFabiIpv4TransportV1 } = require("../services/kds/cingKdsFabiIpv4TransportV1");
const { createClient } = require("@supabase/supabase-js");

const {
  RUN_CONFIRMATION,
  createFabiKdsControlProofLauncherV1
} = require("../services/kds/cingKdsFabiControlProofLauncherV1");

const APPROVED_SCOPE = Object.freeze({
  company_uid: "d1627d1b-4ad8-4c2b-86ff-76d70b9b8cad",
  brand_uid: "d76e55e9-5b31-48da-987d-d096b8a4793c",
  store_uid: "4aac4b7a-e846-4a40-992a-1cab735c9a4f"
});

async function main() {
  const launcher = createFabiKdsControlProofLauncherV1({
    approvedScope: APPROVED_SCOPE,
    configurationProvider: async () => ({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      IPOS_TOKEN: process.env.KDS_FABI_AUTHORIZATION,
      IPOS_ACCESS_TOKEN: process.env.KDS_FABI_ACCESS_TOKEN
    }),
    createSupabaseClient: config =>
      createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY),
    requestFn: createKdsFabiIpv4TransportV1({ request: axios })
  });

  const evidence = await launcher.runOnce({
    confirmation: process.env.CING_KDS_CONTROL_PROOF_CONFIRM
  });

  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  process.exitCode = evidence.status === "completed" ? 0 : 2;
}

main().catch(() => {
  process.stdout.write("{\"status\":\"hold\",\"error_code\":\"KDS_CONTROL_PROOF_FAILED\"}\n");
  process.exitCode = 2;
});

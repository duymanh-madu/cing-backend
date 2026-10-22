"use strict";

require("dotenv").config();

const axios = require("axios");
const { createKdsFabiIpv4TransportV1 } = require("../services/kds/cingKdsFabiIpv4TransportV1");
const { createClient } = require("@supabase/supabase-js");

const {
  SHADOW_PILOT_CONFIRMATION,
  createFabiKdsShadowPilotLauncherV1
} = require("../services/kds/cingKdsFabiShadowPilotLauncherV1");

async function main() {
  const launcher = createFabiKdsShadowPilotLauncherV1({
    configurationProvider: async () => ({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      KDS_FABI_AUTHORIZATION: process.env.KDS_FABI_AUTHORIZATION,
      KDS_FABI_ACCESS_TOKEN: process.env.KDS_FABI_ACCESS_TOKEN,
      target: {
        pos_parent: process.env.KDS_SHADOW_POS_PARENT,
        pos_id: process.env.KDS_SHADOW_POS_ID
      },
      fabi_scope: {
        company_uid: process.env.KDS_FABI_COMPANY_UID,
        brand_uid: process.env.KDS_FABI_BRAND_UID,
        store_uid: process.env.KDS_FABI_STORE_UID
      }
    }),
    createSupabaseClient: config =>
      createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY),
    controlProofDependencies: {
      requestFn: createKdsFabiIpv4TransportV1({ request: axios })
    }
  });
  const result = await launcher.runOnce({
    confirmation: process.env.CING_KDS_SHADOW_PILOT_CONFIRM
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.status === "observed" ? 0 : 2;
}

main().catch(() => {
  process.stdout.write("{\"status\":\"hold\",\"error_code\":\"KDS_SHADOW_PILOT_FAILED\"}\n");
  process.exitCode = 2;
});

"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const {
  createFabiIposCredentialCompositionV1
} = require(
  "../cingKdsFabiIposCredentialCompositionV1"
);

const SAME_FOODHUB_BRAND_TOKEN =
  "foodhub-brand-token-test-only";

function base({
  configurationProvider,
  requestFn
} = {}) {
  return {
    configurationProvider:
      configurationProvider ||
      (async () => ({
        IPOS_TOKEN:
          SAME_FOODHUB_BRAND_TOKEN,

        IPOS_ACCESS_TOKEN:
          SAME_FOODHUB_BRAND_TOKEN
      })),

    requestFn:
      requestFn ||
      (async () => ({
        status: 200,

        body: {
          data: []
        },

        json: {
          data: []
        }
      }))
  };
}

test(
  "construction is dormant and reads no configuration",
  () => {
    let reads = 0;
    let requests = 0;

    const composition =
      createFabiIposCredentialCompositionV1(
        base({
          configurationProvider:
            async () => {
              reads++;

              return {};
            },

          requestFn:
            async () => {
              requests++;

              return {
                status: 200,
                body: { data: [] },
                json: { data: [] }
              };
            }
        })
      );

    assert.equal(reads, 0);
    assert.equal(requests, 0);
    assert.equal(
      typeof composition.c04HttpClient
        .getSaleChangeLog,
      "function"
    );
    assert.equal(
      typeof composition.c03HttpClient
        .getSaleDetail,
      "function"
    );
  }
);

test(
  "same Foodhub brand token is forwarded to both required C04 headers",
  async () => {
    let request;

    const composition =
      createFabiIposCredentialCompositionV1(
        base({
          requestFn:
            async input => {
              request = input;

              return {
                status: 200,
                body: { data: [] }
              };
            }
        })
      );

    await composition.c04HttpClient
      .getSaleChangeLog({
        company_uid: "COMPANY",
        brand_uid: "BRAND",
        store_uid: "STORE",
        start_date: 100,
        end_date: 200
      });

    assert.equal(
      request.headers.Authorization,
      SAME_FOODHUB_BRAND_TOKEN
    );
    assert.equal(
      request.headers.access_token,
      SAME_FOODHUB_BRAND_TOKEN
    );
    assert.equal(
      request.headers.fabi_type,
      "pos-cms"
    );
  }
);

test(
  "same Foodhub brand token is forwarded to both required C03 headers",
  async () => {
    let request;

    const composition =
      createFabiIposCredentialCompositionV1(
        base({
          requestFn:
            async input => {
              request = input;

              return {
                status: 200,
                json: { data: [] }
              };
            }
        })
      );

    await composition.c03HttpClient
      .getSaleDetail({
        companyUid: "COMPANY",
        brandUid: "BRAND",
        storeUid: "STORE",
        startDate: 100,
        endDate: 200,
        search: "TRAN-1"
      });

    assert.equal(
      request.headers.Authorization,
      SAME_FOODHUB_BRAND_TOKEN
    );
    assert.equal(
      request.headers.access_token,
      SAME_FOODHUB_BRAND_TOKEN
    );
    assert.equal(
      request.headers.fabi_type,
      "pos-cms"
    );
  }
);

test(
  "missing credentials fail closed without sending a request",
  async () => {
    let requests = 0;

    const composition =
      createFabiIposCredentialCompositionV1(
        base({
          configurationProvider:
            async () => ({
              IPOS_TOKEN: ""
            }),

          requestFn:
            async () => {
              requests++;

              return {
                status: 200,
                body: { data: [] }
              };
            }
        })
      );

    await assert.rejects(
      composition.c04HttpClient
        .getSaleChangeLog({
          company_uid: "COMPANY",
          brand_uid: "BRAND",
          store_uid: "STORE",
          start_date: 100,
          end_date: 200
        }),
      /KDS_FABI_IPOS_AUTH_REQUIRED/
    );

    assert.equal(requests, 0);
  }
);

test(
  "configuration source owns no environment, network, or logging primitive",
  () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "cingKdsFabiIposCredentialCompositionV1.js"
      ),
      "utf8"
    );

    const executableSource = source.replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      ""
    );

    for (const forbidden of [
      /process\s*\.\s*env/,
      /require\s*\(\s*["']dotenv["']\s*\)/,
      /\bfetch\s*\(/,
      /\baxios\b/,
      /console\s*\./,
      /set(?:Interval|Timeout)\s*\(/
    ]) {
      assert.doesNotMatch(
        executableSource,
        forbidden
      );
    }
  }
);

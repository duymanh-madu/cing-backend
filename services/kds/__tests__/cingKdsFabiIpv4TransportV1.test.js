"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createKdsFabiIpv4TransportV1 } = require("../cingKdsFabiIpv4TransportV1");
const { summarizeC04LogTypesV1 } = require("../cingKdsC04LogClassificationV1");

test("KDS transport forces IPv4, preserves credentials and cancellation, and disables redirects", async () => {
  const headers = { Authorization: "test-only", access_token: "test-app" };
  const signal = new AbortController().signal;
  const data = { data: [] };
  let calls = 0;
  const send = createKdsFabiIpv4TransportV1({ request: async options => {
    calls++;
    assert.equal(options.family, 4);
    assert.equal(options.maxRedirects, 0);
    assert.equal(options.timeout, 11000);
    assert.equal(options.headers, headers);
    assert.equal(options.signal, signal);
    assert.equal(options.validateStatus(403), true);
    return { status: 403, data };
  }});
  assert.equal(calls, 0);
  const result = await send({ method: "GET", url: "https://posapi.ipos.vn/api/test", headers, signal });
  assert.equal(result.status, 403);
  assert.equal(result.body, data);
  assert.equal(result.json, data);
  assert.equal(calls, 1);
});

test("foreign origin and mutation fail before transport", async () => {
  let calls = 0;
  const send = createKdsFabiIpv4TransportV1({ request: async () => { calls++; } });
  for (const [method, url] of [["POST", "https://posapi.ipos.vn/a"], ["GET", "https://example.com/a"], ["GET", "https://user@posapi.ipos.vn/a"]]) {
    await assert.rejects(send({ method, url }), /TARGET_FORBIDDEN/);
  }
  assert.equal(calls, 0);
});

test("print logs stay outside quantity candidates; unknown types require review", () => {
  assert.deepEqual(summarizeC04LogTypesV1([
    ...Array(41).fill({ log_type: "SALE_CHANGE" }),
    ...Array(3).fill({ log_type: "PRINT_PROVISIONAL_INVOICE" }),
    { log_type: "RE_PRINT_BILL" }, { log_type: "UNKNOWN" }
  ]), { signed_delta_candidate: 41, print_observation: 4, review_required: 1, payment_verified: false, completeness_verified: false });
});

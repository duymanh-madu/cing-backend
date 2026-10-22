"use strict";

// Scoped to injected KDS FABi requests; no global DNS or Axios mutation.
function createKdsFabiIpv4TransportV1({ request }) {
  if (typeof request !== "function") throw new Error("KDS_TRANSPORT_REQUIRED");
  return async function requestFabi({ method, url, headers, signal }) {
    const target = new URL(url);
    if (target.origin !== "https://posapi.ipos.vn" || target.username || target.password || method !== "GET") {
      throw new Error("KDS_TRANSPORT_TARGET_FORBIDDEN");
    }
    const response = await request({
      method, url, headers, signal, family: 4,
      timeout: 11_000, maxRedirects: 0,
      validateStatus: () => true
    });
    return Object.freeze({ status: response.status, body: response.data, json: response.data });
  };
}

module.exports = { createKdsFabiIpv4TransportV1 };

const {
  normalizePhone,
} = require("./phoneIdentity");

function normalizeLoosePhone(value) {
  const raw =
    String(value || "")
      .replace(/\D/g, "")
      .replace(/^84/, "0");

  if (!raw) return "";

  try {
    return normalizePhone(raw) || raw;
  } catch {
    return raw;
  }
}

function isLeaderboardSelfRequest(
  req,
  requestedIdentity
) {
  const customer =
    req?.customer || null;

  if (!customer) {
    return false;
  }

  const requested =
    String(requestedIdentity || "")
      .trim();

  if (!requested) {
    return false;
  }

  const customerId =
    String(customer.id || "")
      .trim();

  if (
    customerId &&
    requested === customerId
  ) {
    return true;
  }

  const requestedPhone =
    normalizeLoosePhone(
      requested
    );

  const customerPhone =
    normalizeLoosePhone(
      customer.phone
    );

  return Boolean(
    requestedPhone &&
    customerPhone &&
    requestedPhone ===
      customerPhone
  );
}

function denyLeaderboardCrossUserRead(
  res
) {
  return res.status(403).json({
    success:false,
    error:
      "LEADERBOARD_SELF_RANK_ONLY",
  });
}

module.exports = {
  isLeaderboardSelfRequest,
  denyLeaderboardCrossUserRead,
};

const sessions =
  new Map();

/**
 * =====================================================
 * CREATE SESSION
 * =====================================================
 */

async function createSession({
  customerId,
  refreshToken,
}) {

  sessions.set(
    customerId,
    {
      refreshToken,
      createdAt:
        Date.now(),
    }
  );

}

/**
 * =====================================================
 * DELETE SESSIONS
 * =====================================================
 */

async function deleteCustomerSessions({
  customerId,
}) {

  sessions.delete(
    customerId
  );

}

module.exports = {

  createSession,
  deleteCustomerSessions,

};
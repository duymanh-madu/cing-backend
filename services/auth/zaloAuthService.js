/**
 * =====================================================
 * ZALO AUTH SERVICE
 * =====================================================
 */

async function verifyZaloIdentity({
  accessToken,
}) {

  /**
   * Future:
   * Verify with Zalo Open API
   */

  return {

    success: true,

    zaloId:
      "mock_zalo_user",

  };

}

module.exports = {

  verifyZaloIdentity,

};
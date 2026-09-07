const express    = require("express");


const authMiddleware =
  require(
    "../middlewares/authMiddleware"
  );

const {
  normalizePhone,
} = require(
  "../utils/phoneIdentity"
);
const {
  resolveTypedDeliveryAddress,
} = require(
  "../services/typedDeliveryAddressResolutionService"
);

const router     = express.Router();
const {
  calculateShippingFee,
} = require("../services/shippingService");

/**
 * =====================================================
 * GET /shipping/estimate
 * =====================================================
 * Priority:
 * 1. iPos foodbook API
 * 2. shipping_tiers từ app_configs (DB)
 * 3. shipping_fee_per_km từ app_configs (DB)
 * =====================================================
 */
router.get("/estimate", async (req, res) => {
  try {
    const {
      lat,
      lng,
      amount,
    } = req.query;

    const result =
      await calculateShippingFee({
        total_amount:
          Number(amount || 0),
        destination_latitude:
          lat,
        destination_longitude:
          lng,
      });

    if (!result.success) {
      if (
        result.code ===
        "OUT_OF_DELIVERY_RANGE"
      ) {
        return res.json({
          success: true,
          ship_fee: -1,
          dist_km:
            result.distance_km,
          reason:
            result.code,
        });
      }

      return res.status(400).json({
        success: false,
        error:
          result.message ||
          result.code,
        code:
          result.code,
      });
    }

    return res.json({
      success: true,
      ship_fee:
        result.shipping_fee,
      dist_km:
        result.distance_km,
      reason:
        result.authority,
    });
  } catch (err) {
    console.error(
      "[SHIPPING] estimate error:",
      err.message
    );

    return res.status(500).json({
      success: false,
      error:
        "Shipping estimate failed",
    });
  }
});

/**
 * =====================================================
 * POST /shipping/calculate (legacy — giữ nguyên)
 * =====================================================
 */
router.post(
  "/calculate",
  (req, res) => {
    /*
     * Retired legacy shipping quote authority.
     *
     * Client-provided subtotal/distance must never price delivery.
     * Canonical shipping is calculated only by shippingService
     * from backend-owned order amount and destination coordinates.
     */
    return res
      .status(410)
      .json({
        success: false,
        code:
          "CANONICAL_SHIPPING_ENDPOINT_REQUIRED",
        error:
          "Phí giao hàng phải được tính qua luồng checkout chuẩn",
      });
  }
);


/**
 * POST /shipping/resolve-address
 *
 * Resolve customer-entered delivery text into a backend-owned
 * candidate pin, compare it with current GPS, and calculate
 * shipping for that candidate destination.
 */
router.post(
  "/resolve-address",
  authMiddleware,
  async (req, res) => {
    try {
      const canonicalUserId =
        normalizePhone(
          req.customer?.phone ||
          ""
        );

      if (!canonicalUserId) {
        return res
          .status(401)
          .json({
            success: false,
            code:
              "DELIVERY_CUSTOMER_IDENTITY_REQUIRED",
            error:
              "Không xác định được tài khoản thành viên",
          });
      }

      const result =
        await resolveTypedDeliveryAddress({
          user_id:
            canonicalUserId,
          address_text:
            req.body?.address_text,

          current_latitude:
            req.body?.current_latitude,

          current_longitude:
            req.body?.current_longitude,

          order_amount:
            req.body?.order_amount,
        });

      if (
        result.success !== true
      ) {
        return res
          .status(400)
          .json(result);
      }

      return res.json(
        result
      );
    } catch (error) {
      const clientCodes =
        new Set([
          "DELIVERY_ADDRESS_TEXT_INVALID",
          "DELIVERY_ADDRESS_NOT_FOUND",
          "DELIVERY_ADDRESS_AMBIGUOUS",
          "DELIVERY_ADDRESS_TOO_COARSE",
          "CURRENT_DELIVERY_LATITUDE_INVALID",
          "CURRENT_DELIVERY_LONGITUDE_INVALID",
        ]);

      const authCodes =
        new Set([
          "DELIVERY_CUSTOMER_IDENTITY_REQUIRED",
          "DELIVERY_LOCATION_CANDIDATE_USER_REQUIRED",
        ]);

      let status = 502;

      if (
        authCodes.has(
          error.code
        )
      ) {
        status = 401;
      } else if (
        clientCodes.has(
          error.code
        )
      ) {
        status = 400;
      } else if (
        error.code ===
          "DELIVERY_GEOCODING_NOT_CONFIGURED" ||
        error.code ===
          "DELIVERY_LOCATION_TOKEN_SECRET_NOT_CONFIGURED"
      ) {
        status = 503;
      }

      return res
        .status(status)
        .json({
          success: false,

          code:
            error.code ||
            "DELIVERY_ADDRESS_RESOLUTION_FAILED",

          error:
            error.message,
        });
    }
  }
);

/**
 * =====================================================
 * POST /shipping/decode-location
 * =====================================================
 * Nhận token từ zmp-sdk getLocation()
 * Decode thành lat/lng qua Zalo API
 * Trả về lat/lng + phí ship luôn
 * =====================================================
 */
router.post("/decode-location", async (req, res) => {
  try {
    const {
      token,
      miniAccessToken,
    } = req.body || {};

    if (!token) {
      return res
        .status(400)
        .json({
          success: false,
          error:
            "Missing location token",
        });
    }

    const miniAccessTokenSafe =
      String(
        miniAccessToken || ""
      ).trim();

    if (!miniAccessTokenSafe) {
      return res
        .status(400)
        .json({
          success: false,
          error:
            "Missing mini access token",
        });
    }

    /*
     * Zalo decode remains on the Vietnam server.
     *
     * This endpoint owns coordinate decoding only.
     * It must never calculate or return shipping price.
     */
    const axios =
      require("axios");

    const MATBAO_URL =
      process.env.GAME_SERVER_URL ||
      "http://112.78.3.72:3001";

    const zaloRes =
      await axios
        .post(
          `${MATBAO_URL}/zalo/decode-location`,
          {
            token,

            mini_access_token:
              miniAccessTokenSafe,
          }
        )
        .catch(
          error => ({
            data:
              error.response?.data ||
              {
                error:
                  error.message,
              },
          })
        );

    const latitude =
      Number(
        zaloRes.data?.latitude ??
        zaloRes.data?.data?.latitude
      );

    const longitude =
      Number(
        zaloRes.data?.longitude ??
        zaloRes.data?.data?.longitude
      );

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res
        .status(400)
        .json({
          success: false,

          error:
            "Cannot decode location token",
        });
    }

    return res.json({
      success: true,
      latitude,
      longitude,
    });
  } catch (error) {
    return res
      .status(500)
      .json({
        success: false,

        error:
          error.message,
      });
  }
});

module.exports = router;

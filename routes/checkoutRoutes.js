const crypto = require("crypto");
const express = require("express");
const router = express.Router();

const authMiddleware =
  require("./../middlewares/authMiddleware");

const {
  normalizePhone,
} = require(
  "../utils/phoneIdentity"
);

const {
  settleWalletOrderPayment,
} = require(
  "../services/wallet/cingWalletOrderPaymentService"
);

const {
  settlePointsOnlyOrderPayment,
} = require(
  "../services/payment/commercePointsOnlySettlementService"
);


const {
  assertPointsOnlyCommerceReadiness,
} = require(
  "../services/commerce/pointsOnlyOperationalReadinessService"
);

const {
  validateCheckout,
} = require(
  "../services/checkoutValidationService"
);

const {
  createPaymentSession,
} = require(
  "../services/payment/paymentOrchestratorService"
);

const {
  normalizeDeliveryLocation,
} = require(
  "../services/deliveryLocationAuthorityService"
);

const {
  resolveFinalDeliveryDestination,
} = require(
  "../services/finalDeliveryDestinationAuthorityService"
);

const {
  consumeDeliveryLocationCandidate,
} = require(
  "../services/deliveryLocationCandidateConsumeService"
);

const {
  createCommerceCheckoutFingerprint,
} = require(
  "../services/payment/commerceCheckoutFingerprintService"
);


const CHECKOUT_REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


function getCheckoutRequestId(
  req
) {
  const supplied =
    String(
      req.body
        ?.checkout_request_id ||
      ""
    ).trim();

  /*
   * Backward-compatible backend cutover:
   *
   * Existing clients may omit checkout_request_id.
   * They receive a one-shot server UUID and continue working.
   *
   * New frontend sends and preserves its UUID across retries,
   * activating durable exact-retry semantics.
   */
  if (!supplied) {
    return crypto.randomUUID();
  }

  if (
    !CHECKOUT_REQUEST_ID_PATTERN
      .test(
        supplied
      )
  ) {
    const error =
      new Error(
        "COMMERCE_CHECKOUT_REQUEST_ID_INVALID"
      );

    error.code =
      "COMMERCE_CHECKOUT_REQUEST_ID_INVALID";

    error.statusCode =
      400;

    throw error;
  }

  return supplied
    .toLowerCase();
}


function normalizeOrderType(value, shippingAddress = "") {
  const raw = String(value || "").trim().toLowerCase();

  if (["delivery", "deli", "ship", "shipping"].includes(raw)) return "delivery";
  if (["dine_in", "dinein", "dine-in", "store", "table", "eat_in", "eat-in", "tai_quan", "tại quán", "tai quan"].includes(raw)) return "dine_in";
  if (["pickup", "takeaway", "take_away", "takeout", "mang_ve", "mang về", "mang ve"].includes(raw)) return "pickup";

  return String(shippingAddress || "").trim() ? "delivery" : "pickup";
}

function getIncomingOrderType(req, shippingAddress = "") {
  return normalizeOrderType(
    req.body?.order_type ||
    req.body?.orderType ||
    req.body?.fulfillment_type ||
    req.body?.fulfillmentType,
    shippingAddress
  );
}


function getIncomingDeliveryCandidateToken(req) {
  const direct =
    String(
      req.body?.candidate_token ||
      ""
    ).trim();

  const legacy =
    String(
      req.body?.delivery_location_candidate_token ||
      ""
    ).trim();

  /*
   * candidate_token is the current canonical FE contract.
   *
   * delivery_location_candidate_token remains accepted only as
   * a compatibility alias for already-released clients.
   *
   * If both are supplied they must identify the exact same signed
   * capability. Ambiguous capability inputs fail closed.
   */
  if (
    direct &&
    legacy &&
    direct !== legacy
  ) {
    const error =
      new Error(
        "Delivery candidate token fields conflict"
      );

    error.code =
      "DELIVERY_LOCATION_CANDIDATE_TOKEN_CONFLICT";

    error.statusCode =
      400;

    throw error;
  }

  return (
    direct ||
    legacy ||
    null
  );
}

/**
 * ============================================
 * TEST
 * ============================================
 */

router.get(
  "/test",

  async (req, res) => {

    res.json({

      success: true,

      route:
        "checkout routes working",

    });

  }
);

/**
 * ============================================
 * VALIDATE CHECKOUT
 * ============================================
 */

router.post(

  "/validate",

  authMiddleware,

  async (req, res) => {

    /*
     * Deprecated checkout quote/validation surface.
     *
     * There are no active application consumers for this route.
     *
     * Canonical commerce validation is user-bound and executes only
     * inside POST /api/checkout/create, which owns:
     *
     * - authenticated customer identity
     * - merchandise pricing
     * - fulfillment/shipping
     * - membership tier
     * - voucher pricing
     * - loyalty-point balance/value
     * - monetary remainder
     * - payment transaction / funding rail
     *
     * This endpoint intentionally performs zero financial work.
     */
    return res
      .status(410)
      .json({

        success: false,

        code:
          "COMMERCE_CHECKOUT_ENDPOINT_REQUIRED",

        error:
          "Xác thực checkout phải thực hiện qua checkout chuẩn",

        checkout_endpoint:
          "/api/checkout/create",

      });

  }

);


router.post(

  "/create",

  authMiddleware,

  async (req, res) => {

    try {

      const {
        customer_name,
        customer_phone,
        shipping_address,
        delivery_address_detail,
        delivery_location_source,
        candidate_token,
        delivery_location_candidate_token,
        order_type,
        destination_latitude,
        destination_longitude,
        items,
        submitted_shipping_fee,
        submitted_total_amount,
        payment_method,
        payment_provider,
        points_requested = 0,
      } = req.body;

      const canonicalUserId =
        normalizePhone(
          req.customer?.phone || ""
        );

      if (!canonicalUserId) {
        return res
          .status(401)
          .json({
            success: false,
            code:
              "COMMERCE_CUSTOMER_IDENTITY_REQUIRED",
            error:
              "Không xác định được tài khoản thành viên",
          });
      }


      const checkoutRequestId =
        getCheckoutRequestId(
          req
        );


      const canonicalDeliveryCandidateToken =
        getIncomingDeliveryCandidateToken(
          req
        );

      /**
       * ============================================
       * VALIDATE CHECKOUT
       * ============================================
       */

      const canonicalOrderType =
        getIncomingOrderType(
          req,
          shipping_address
        );

      const finalDestination =
        await resolveFinalDeliveryDestination({
          user_id:
            canonicalUserId,

          order_type:
            canonicalOrderType,

          gps_latitude:
            destination_latitude,

          gps_longitude:
            destination_longitude,

          gps_location_source:
            delivery_location_source,

          address_detail:
            delivery_address_detail ||
            shipping_address,

          candidate_token:
            canonicalDeliveryCandidateToken,
        });

      const canonicalDeliveryLocation =
        finalDestination.location;



      const validationResult =

        await validateCheckout({

          user_id:
            canonicalUserId,

          items,

          order_type:
            canonicalOrderType,

          destination_latitude:
            canonicalDeliveryLocation.delivery_latitude,

          destination_longitude:
            canonicalDeliveryLocation.delivery_longitude,

          shipping_route_snapshot:
            finalDestination
              .candidate_authority
              ?.route_snapshot ||
            null,

          submitted_shipping_fee,

          submitted_total_amount,

          payment_method,

          points_requested,

        });

      /**
       * VALIDATION FAILED
       */

      if (
        !validationResult.success
      ) {

        return res.status(400).json(

          validationResult

        );

      }

      /**
       * ============================================
       * CREATE PAYMENT SESSION
       * ============================================
       */

            const isPointsOnly =
        validationResult.remaining_payable ===
          0 &&
        validationResult.points_used >
          0;


      const canonicalPaymentMethod =
        isPointsOnly
          ? "points"
          : payment_method;


      const canonicalPaymentProvider =
        isPointsOnly
          ? "internal"
          : payment_provider;


      /*
       * Operational rail readiness.
       *
       * Canonical pricing has already established whether this is
       * a true points-only checkout. Before creating a durable
       * payment transaction or reserving points, require an
       * iPOS-approved tender configuration for that zero-money rail.
       *
       * Mixed Points + Wallet and mixed Points + external payments
       * retain a positive monetary rail and do not enter this gate.
       */
      if (isPointsOnly) {

        assertPointsOnlyCommerceReadiness();

      }


      /*
       * Canonical idempotency fingerprint.
       *
       * Only backend-authoritative checkout results participate.
       * Client-submitted totals and shipping fees are intentionally
       * excluded.
       */
      const checkoutFingerprint =
        createCommerceCheckoutFingerprint({
          user_id:
            canonicalUserId,

          order_type:
            canonicalOrderType,

          candidate_jti:
            finalDestination
              .candidate_authority
              ?.jti ||
            null,

          destination_latitude:
            canonicalDeliveryLocation
              .delivery_latitude,

          destination_longitude:
            canonicalDeliveryLocation
              .delivery_longitude,

          delivery_address_detail:
            canonicalDeliveryLocation
              .delivery_address_detail,

          customer_name:
            customer_name ||
            "",

          customer_note:
            String(
              req.body?.note ||
              ""
            ).trim(),

          items:
            validationResult.items,

          subtotal:
            validationResult.subtotal,

          tier_key:
            validationResult.tier_key,

          tier_discount:
            validationResult.tier_discount,

          points_requested:
            validationResult.points_requested,

          points_used:
            validationResult.points_used,

          point_value_vnd:
            validationResult.point_value_vnd,

          points_discount:
            validationResult.points_discount,

          shipping_fee:
            validationResult.shipping_fee,

          distance_km:
            validationResult.distance_km,

          manual_shipping_quote_required:
            validationResult
              .manual_shipping_quote_required ===
              true,

          total_amount:
            validationResult.total_amount,

          payment_method:
            canonicalPaymentMethod,

          payment_provider:
            canonicalPaymentProvider,
        });


if (
        finalDestination
          .candidate_authority
      ) {
        await consumeDeliveryLocationCandidate({
          jti:
            finalDestination
              .candidate_authority
              .jti,

          user_id:
            canonicalUserId,

          exp:
            finalDestination
              .candidate_authority
              .exp,

          checkout_request_id:
            checkoutRequestId,

});
      }


      const paymentResult =

        await createPaymentSession({

          user_id:
            canonicalUserId,

          payment_provider:
            canonicalPaymentProvider,

          payment_method:
            canonicalPaymentMethod,

          payment_purpose:
            "order",

          total_amount:
            validationResult.total_amount,

                    checkout_request_id:
            checkoutRequestId,

          checkout_fingerprint:
            checkoutFingerprint,

cart_snapshot: {

            user_id:
              canonicalUserId,

            checkout_request_id:
              checkoutRequestId,

            checkout_fingerprint:
              checkoutFingerprint,


            customer_name,

            customer_phone:
              canonicalUserId,

            shipping_address,

            /*
             * System shipping note is backend-derived from canonical
             * distance policy. Client note may add context but cannot
             * suppress this operational instruction.
             */
            note: [
              String(
                req.body?.note ||
                ""
              ).trim(),

              validationResult
                .manual_shipping_quote_required ===
                true
                ? (
                    validationResult
                      .shipping_quote_note ||
                    "Cửa hàng sẽ liên hệ lại để thống nhất đơn giá ship."
                  )
                : "",
            ]
              .filter(Boolean)
              .join(" | "),

            manual_shipping_quote_required:
              validationResult
                .manual_shipping_quote_required ===
                true,

            shipping_quote_note:
              validationResult
                .shipping_quote_note ||
              null,

            order_type:
              canonicalOrderType,

            destination_latitude:
              canonicalDeliveryLocation.delivery_latitude,

            destination_longitude:
              canonicalDeliveryLocation.delivery_longitude,

            delivery_latitude:
              canonicalDeliveryLocation.delivery_latitude,

            delivery_longitude:
              canonicalDeliveryLocation.delivery_longitude,

            delivery_address_detail:
              canonicalDeliveryLocation.delivery_address_detail,

            delivery_location_source:
              canonicalDeliveryLocation.delivery_location_source,

            items:
              validationResult.items,

            subtotal:

              validationResult.subtotal,

            tier_key:

              validationResult.tier_key,

            tier_discount:

              validationResult.tier_discount,

            pre_points_payable:

              validationResult.pre_points_payable,

            points_requested:

              validationResult.points_requested,

            points_used:

              validationResult.points_used,

            point_value_vnd:

              validationResult.point_value_vnd,

            points_discount:

              validationResult.points_discount,

            remaining_payable:

              validationResult.remaining_payable,

            shipping_fee:

              validationResult.shipping_fee,

            shipping_distance:

              validationResult.distance_km,

            total_amount:

              validationResult.total_amount,

          },

        });

            if (
        canonicalPaymentMethod ===
          "points"
      ) {

        const paymentTransactionId =
          paymentResult?.payment?.id;


        if (!paymentTransactionId) {

          const error =
            new Error(
              "COMMERCE_POINTS_ONLY_PAYMENT_TRANSACTION_ID_REQUIRED"
            );

          error.code =
            "COMMERCE_POINTS_ONLY_PAYMENT_TRANSACTION_ID_REQUIRED";

          throw error;

        }


        const pointsSettlement =
          await settlePointsOnlyOrderPayment({

            req,

            paymentTransactionId,

          });


        return res.json({

          success: true,

          checkout_validated:
            true,

          checkout_request_id:
            checkoutRequestId,

          subtotal:
            validationResult.subtotal,

          shipping_fee:
            validationResult.shipping_fee,

          pre_points_payable:
            validationResult.pre_points_payable,

          points_used:
            validationResult.points_used,

          points_discount:
            validationResult.points_discount,

          total_amount:
            validationResult.total_amount,

          distance_km:
            validationResult.distance_km,

          free_shipping:
            validationResult.free_shipping,

          duration_text:
            validationResult.duration_text,

          payment:
            paymentResult,

          points_settlement:
            pointsSettlement,

        });

      }


if (
        canonicalPaymentMethod ===
          "cing_wallet"
      ) {
        const paymentTransactionId =
          paymentResult?.payment?.id;

        if (!paymentTransactionId) {
          const error =
            new Error(
              "WALLET_PAYMENT_TRANSACTION_ID_REQUIRED"
            );

          error.code =
            "WALLET_PAYMENT_TRANSACTION_ID_REQUIRED";

          throw error;
        }

        const walletSettlement =
          await settleWalletOrderPayment({
            req,
            paymentTransactionId,
          });

        return res.json({
          success: true,
          checkout_validated:
            true,

          checkout_request_id:
            checkoutRequestId,
          subtotal:
            validationResult.subtotal,
          shipping_fee:
            validationResult.shipping_fee,
          total_amount:
            validationResult.total_amount,
          distance_km:
            validationResult.distance_km,
          free_shipping:
            validationResult.free_shipping,
          duration_text:
            validationResult.duration_text,
          payment:
            paymentResult,
          wallet_settlement:
            walletSettlement,
        });
      }

      /**
       * RESPONSE
       */

      res.json({

        success: true,

        checkout_validated:
          true,

        checkout_request_id:
          checkoutRequestId,

        subtotal:

          validationResult.subtotal,

        shipping_fee:

          validationResult.shipping_fee,

        total_amount:

          validationResult.total_amount,

        distance_km:

          validationResult.distance_km,

        free_shipping:

          validationResult.free_shipping,

        duration_text:

          validationResult.duration_text,

        payment:

          paymentResult,

      });

    } catch (error) {
      console.error(
        "checkout create error:",
        error.message
      );

      const statusCode =
        Number.isInteger(
          error?.statusCode
        ) &&
        error.statusCode >= 400 &&
        error.statusCode <= 599
          ? error.statusCode
          : 500;

      const responseBody = {
        success: false,
        error:
          error.message,
      };

      if (error?.code) {
        responseBody.code =
          error.code;
      }

      res
        .status(
          statusCode
        )
        .json(
          responseBody
        );
    }
  }
);

/**
 * ============================================
 * EXPORTS
 * ============================================
 */

module.exports =
  router;

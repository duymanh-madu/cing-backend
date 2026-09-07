const supabase =
  require("../../supabase");


function normalizePaymentTransactionId(
  paymentTransactionId
) {

  const value =
    Number(
      paymentTransactionId
    );

  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {

    const error =
      new Error(
        "COMMERCE_POINT_RESERVATION_PAYMENT_ID_INVALID"
      );

    error.code =
      "COMMERCE_POINT_RESERVATION_PAYMENT_ID_INVALID";

    throw error;

  }

  return value;

}


async function reservePaymentPoints({
  paymentTransactionId,
}) {

  const authoritativePaymentTransactionId =
    normalizePaymentTransactionId(
      paymentTransactionId
    );

  /*
   * PostgreSQL derives:
   *
   * - canonical user
   * - requested points
   * - payment state
   * - spendable balance
   *
   * Node supplies payment identity only.
   */
  const {
    data,
    error,
  } = await supabase.rpc(
    "cing_commerce_reserve_payment_points_v1",
    {
      p_payment_transaction_id:
        authoritativePaymentTransactionId,
    }
  );

  if (error) {

    const wrapped =
      new Error(
        error.message ||
          "COMMERCE_POINT_RESERVATION_FAILED"
      );

    wrapped.code =
      error.code ||
      "COMMERCE_POINT_RESERVATION_FAILED";

    wrapped.cause =
      error;

    throw wrapped;

  }

  const result =
    Array.isArray(data)
      ? data[0]
      : data;

  if (!result) {

    const wrapped =
      new Error(
        "COMMERCE_POINT_RESERVATION_RESULT_EMPTY"
      );

    wrapped.code =
      "COMMERCE_POINT_RESERVATION_RESULT_EMPTY";

    throw wrapped;

  }


  const pointsReserved =
    Number(
      result.points_reserved
    );

  if (
    !Number.isSafeInteger(
      pointsReserved
    ) ||
    pointsReserved < 0
  ) {

    const wrapped =
      new Error(
        "COMMERCE_POINT_RESERVATION_RESULT_INVALID"
      );

    wrapped.code =
      "COMMERCE_POINT_RESERVATION_RESULT_INVALID";

    throw wrapped;

  }


  const status =
    String(
      result.reservation_status ||
        ""
    ).trim();


  if (
    pointsReserved === 0 &&
    status !== "not_required"
  ) {

    const wrapped =
      new Error(
        "COMMERCE_POINT_RESERVATION_ZERO_STATE_INVALID"
      );

    wrapped.code =
      "COMMERCE_POINT_RESERVATION_ZERO_STATE_INVALID";

    throw wrapped;

  }


  if (
    pointsReserved > 0 &&
    ![
      "reserved",
      "consumed",
    ].includes(status)
  ) {

    const wrapped =
      new Error(
        "COMMERCE_POINT_RESERVATION_STATE_INVALID"
      );

    wrapped.code =
      "COMMERCE_POINT_RESERVATION_STATE_INVALID";

    throw wrapped;

  }


  return {

    payment_transaction_id:
      authoritativePaymentTransactionId,

    user_id:
      result.user_id || null,

    points_reserved:
      pointsReserved,

    balance_before:
      result.balance_before ?? null,

    balance_after:
      result.balance_after ?? null,

    reservation_status:
      status,

    replayed:
      result.replayed === true,

  };

}


module.exports = {

  reservePaymentPoints,

};

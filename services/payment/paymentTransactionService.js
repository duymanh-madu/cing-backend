const crypto =
  require("crypto");

const supabase =
  require("../../supabase");

function generateTransactionCode() {

  return `PAY-${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;

}

async function createTransaction({

  user_id,

  payment_provider,

  payment_method,

  payment_purpose = "order",

  amount,

  cart_snapshot,

  expired_at,

  checkout_request_id = null,

  checkout_fingerprint = null,

}) {

  const transaction_code =

    generateTransactionCode();


  const {

    data,

    error,

  } = await supabase

    .from(

      "payment_transactions"

    )

    .insert({

      user_id,

      transaction_code,

      payment_provider,

      payment_method,

      payment_purpose,

      amount,

      cart_snapshot,

      payment_status:

        "pending",

      payment_session_status:

        "created",

      expired_at,

      checkout_request_id,

      checkout_fingerprint,

    })

    .select()

    .single();


  if (error) {

    /*
     * Order checkout idempotency is database-enforced.
     *
     * A concurrent/exact retry may lose the unique insert race.
     * The existing row is then the only permissible payment
     * authority for the same authenticated user + request ID.
     */
    const isCheckoutRetry =

      payment_purpose === "order" &&

      Boolean(

        checkout_request_id

      ) &&

      String(

        error.code || ""

      ) === "23505";


    if (!isCheckoutRetry) {

      const failure =

        new Error(

          error.message

        );

      failure.code =

        error.code ||

        "PAYMENT_TRANSACTION_CREATE_FAILED";

      failure.cause =

        error;

      throw failure;

    }


    const {

      data: existing,

      error: lookupError,

    } = await supabase

      .from(

        "payment_transactions"

      )

      .select("*")

      .eq(

        "user_id",

        user_id

      )

      .eq(

        "checkout_request_id",

        checkout_request_id

      )

      .eq(

        "payment_purpose",

        "order"

      )

      .maybeSingle();


    if (

      lookupError ||

      !existing

    ) {

      const replayLookupError =

        new Error(

          "COMMERCE_CHECKOUT_IDEMPOTENCY_LOOKUP_FAILED"

        );

      replayLookupError.code =

        "COMMERCE_CHECKOUT_IDEMPOTENCY_LOOKUP_FAILED";

      replayLookupError.cause =

        lookupError ||

        error;

      throw replayLookupError;

    }


    if (

      String(

        existing

          .checkout_fingerprint ||

        ""

      ) !==

      String(

        checkout_fingerprint ||

        ""

      )

    ) {

      const conflict =

        new Error(

          "COMMERCE_CHECKOUT_IDEMPOTENCY_CONFLICT"

        );

      conflict.code =

        "COMMERCE_CHECKOUT_IDEMPOTENCY_CONFLICT";

      conflict.statusCode =

        409;

      throw conflict;

    }


    return {

      ...existing,

      _checkout_replayed:

        true,

    };

  }


  return {

    ...data,

    _checkout_replayed:

      false,

  };

}


async function updateTransaction({

  transactionId,

  values,

}) {

  const {

    data,
    error,

  } = await supabase

    .from(
      "payment_transactions"
    )

    .update(values)

    .eq(
      "id",
      transactionId
    )

    .select()

    .single();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

async function findTransactionByCode(
  transactionCode
) {

  const {

    data,
    error,

  } = await supabase

    .from(
      "payment_transactions"
    )

    .select("*")

    .eq(
      "transaction_code",
      transactionCode
    )

    .maybeSingle();

  if (error) {

    throw new Error(
      error.message
    );

  }

  return data;

}

module.exports = {

  createTransaction,

  updateTransaction,

  findTransactionByCode,

};
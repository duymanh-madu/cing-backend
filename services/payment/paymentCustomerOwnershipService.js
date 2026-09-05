const {
  normalizePhone,
} = require(
  "../../utils/phoneIdentity"
);

const {
  findTransactionByCode,
} = require(
  "./paymentTransactionService"
);


function createPaymentOwnershipError({
  message,
  code,
  statusCode,
}) {
  const error =
    new Error(message);

  error.code =
    code;

  error.statusCode =
    statusCode;

  return error;
}


function normalizePaymentTransactionCode(
  value
) {
  const transactionCode =
    String(
      value || ""
    ).trim();

  if (!transactionCode) {
    throw createPaymentOwnershipError({
      message:
        "Mã giao dịch thanh toán không hợp lệ",
      code:
        "PAYMENT_TRANSACTION_CODE_REQUIRED",
      statusCode:
        400,
    });
  }

  return transactionCode;
}


function resolveCanonicalPaymentCustomerId(
  customer
) {
  const userId =
    normalizePhone(
      customer?.phone || ""
    );

  if (!userId) {
    throw createPaymentOwnershipError({
      message:
        "Không xác định được tài khoản thành viên",
      code:
        "PAYMENT_CUSTOMER_IDENTITY_REQUIRED",
      statusCode:
        401,
    });
  }

  return userId;
}


/*
 * Do not distinguish:
 * - transaction does not exist
 * - transaction exists but belongs to another customer
 *
 * Both cases deliberately return the same external contract
 * so transaction codes cannot be used as an ownership oracle.
 */
function paymentNotFoundError() {
  return createPaymentOwnershipError({
    message:
      "Không tìm thấy giao dịch thanh toán",
    code:
      "PAYMENT_NOT_FOUND",
    statusCode:
      404,
  });
}


async function findOwnedPaymentByCode({
  transactionCode,
  customer,
}) {
  const normalizedCode =
    normalizePaymentTransactionCode(
      transactionCode
    );

  const canonicalUserId =
    resolveCanonicalPaymentCustomerId(
      customer
    );

  const payment =
    await findTransactionByCode(
      normalizedCode
    );

  if (!payment) {
    throw paymentNotFoundError();
  }

  const paymentUserId =
    normalizePhone(
      payment.user_id || ""
    );

  if (
    !paymentUserId ||
    paymentUserId !==
      canonicalUserId
  ) {
    throw paymentNotFoundError();
  }

  return payment;
}


module.exports = {
  normalizePaymentTransactionCode,
  resolveCanonicalPaymentCustomerId,
  findOwnedPaymentByCode,
};

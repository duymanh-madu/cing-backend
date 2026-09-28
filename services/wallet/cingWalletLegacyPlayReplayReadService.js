"use strict";

/*
 * CING GAME CENTER V2
 * WALLET V1 COMMITTED PURCHASE REPLAY READ
 *
 * Read committed historical purchase only.
 * No Wallet debit, no game-play credit, no RPC.
 * Never interpret historical balance_after as live balance.
 */

const {
  resolveWalletPlayPurchaseUserId,
  normalizePlayQuantity,
  normalizeRequestId,
} = require("./cingWalletBuyGamePlaysService");

function replayError(code, statusCode) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function safeInteger(value) {
  if (
    typeof value !== "number" &&
    typeof value !== "string"
  ) {
    return null;
  }

  if (
    typeof value === "string" &&
    !/^-?[0-9]+$/.test(value)
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isSafeInteger(number)
    ? number
    : null;
}

function metadataInteger(metadata, key) {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    return null;
  }

  return safeInteger(metadata[key]);
}

async function readCommittedWalletPlayPurchase({
  customer,
  quantity,
  requestId,
  db,
}) {
  const userId =
    resolveWalletPlayPurchaseUserId(customer);

  const requestedQuantity =
    normalizePlayQuantity(quantity);

  const canonicalRequestId =
    normalizeRequestId(requestId).toLowerCase();

  const database =
    db || require("../../supabase");

  const idempotencyKey =
    "wallet_play_purchase:user:"
    + userId
    + ":request:"
    + canonicalRequestId;

  const walletResult = await database
    .from("cing_wallet_transactions")
    .select(
      "id,user_id,transaction_type,amount,"
      + "balance_after,idempotency_key,"
      + "reference_type,reference_id,metadata"
    )
    .eq(
      "idempotency_key",
      idempotencyKey
    )
    .maybeSingle();

  if (walletResult.error) {
    throw replayError(
      "CING_WALLET_PLAY_REPLAY_READ_FAILED",
      503
    );
  }

  const wallet = walletResult.data;

  if (!wallet) {
    return null;
  }

  if (
    typeof wallet.id !== "string" ||
    wallet.user_id !== userId ||
    wallet.idempotency_key !== idempotencyKey ||
    wallet.transaction_type !== "payment" ||
    wallet.reference_type !== "game_play_purchase" ||
    wallet.reference_id !== canonicalRequestId
  ) {
    throw replayError(
      "CING_WALLET_PLAY_PURCHASE_REPLAY_CONFLICT",
      409
    );
  }

  const historicalQuantity =
    metadataInteger(
      wallet.metadata,
      "quantity"
    );

  const unitPrice =
    metadataInteger(
      wallet.metadata,
      "unit_price"
    );

  const totalCost =
    metadataInteger(
      wallet.metadata,
      "total_cost"
    );

  const walletAmount =
    safeInteger(wallet.amount);

  const walletBalanceAfter =
    safeInteger(wallet.balance_after);

  const calculatedCost =
    unitPrice * historicalQuantity;

  if (
    historicalQuantity !== requestedQuantity ||
    unitPrice === null ||
    unitPrice <= 0 ||
    totalCost === null ||
    totalCost <= 0 ||
    !Number.isSafeInteger(calculatedCost) ||
    totalCost !== calculatedCost ||
    walletAmount !== -totalCost ||
    walletBalanceAfter === null ||
    walletBalanceAfter < 0
  ) {
    throw replayError(
      "CING_WALLET_PLAY_PURCHASE_REPLAY_CONFLICT",
      409
    );
  }

  const ledgerResult = await database
    .from("game_play_transactions")
    .select(
      "user_id,transaction_type,amount,"
      + "balance_after,reference_type,reference_id"
    )
    .eq(
      "reference_type",
      "wallet_play_purchase"
    )
    .eq(
      "reference_id",
      wallet.id
    )
    .maybeSingle();

  if (ledgerResult.error) {
    throw replayError(
      "CING_WALLET_PLAY_REPLAY_LEDGER_READ_FAILED",
      503
    );
  }

  const ledger = ledgerResult.data;

  if (!ledger) {
    throw replayError(
      "CING_WALLET_PLAY_PURCHASE_LEDGER_MISSING",
      409
    );
  }

  const ledgerAmount =
    safeInteger(ledger.amount);

  const historicalGamePlaysAfter =
    safeInteger(ledger.balance_after);

  if (
    ledger.user_id !== userId ||
    ledger.transaction_type !== "add" ||
    ledger.reference_type !== "wallet_play_purchase" ||
    ledger.reference_id !== wallet.id ||
    ledgerAmount !== historicalQuantity ||
    historicalGamePlaysAfter === null ||
    historicalGamePlaysAfter < 0
  ) {
    throw replayError(
      "CING_WALLET_PLAY_PURCHASE_LEDGER_CONFLICT",
      409
    );
  }

  return {
    applied: false,
    request_id: canonicalRequestId,
    wallet_transaction_id: wallet.id,
    quantity: historicalQuantity,
    unit_price: unitPrice,
    total_cost: totalCost,
    wallet_balance_after: walletBalanceAfter,
    game_plays_after: historicalGamePlaysAfter,
  };
}

module.exports = {
  readCommittedWalletPlayPurchase,
};

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FINGERPRINT_RE =
  /^[0-9a-f]{64}$/;

const V5_CREDIT_COSTS =
  Object.freeze([
    0,
    1,
    2,
    4,
    8,
    16,
  ]);

function fail(message) {
  throw new Error(message);
}

function normalizeV5ReviveSessionRow(row) {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row)
  ) {
    fail(
      "Block Puzzle V5 session row không hợp lệ"
    );
  }

  const session =
    Object.freeze({
      id:
        String(row.id || ""),

      user_id:
        String(row.user_id || ""),

      game_key:
        String(row.game_key || ""),

      seed:
        Number(row.seed),

      engine_version:
        Number(row.engine_version),

      rules_version:
        Number(row.rules_version),

      score_version:
        Number(row.score_version),

      replay_version:
        Number(row.replay_version),

      status:
        String(row.status || ""),

      expires_at:
        row.expires_at,

      continue_count:
        Number(row.continue_count),
    });

  if (
    !UUID_V4_RE.test(session.id) ||
    !session.user_id
  ) {
    fail(
      "Block Puzzle V5 session identity không hợp lệ"
    );
  }

  if (
    session.game_key !==
      "cing-block-puzzle" ||
    session.engine_version !== 4 ||
    session.rules_version !== 4 ||
    session.score_version !== 3 ||
    session.replay_version !== 5
  ) {
    fail(
      "Block Puzzle V5 session version không hợp lệ"
    );
  }

  if (
    !Number.isSafeInteger(
      session.seed
    ) ||
    session.seed < 1 ||
    session.seed > 4294967295
  ) {
    fail(
      "Block Puzzle V5 seed không hợp lệ"
    );
  }

  /*
   * Submitted/expired sessions can be read for
   * historical idempotent retry verification.
   *
   * This is NOT authorization for a new debit.
   * PostgreSQL remains the financial lifecycle
   * authority after the durable retry lookup.
   */

  if (
    ![
      "active",
      "submitted",
      "expired",
    ].includes(session.status)
  ) {
    fail(
      "Block Puzzle V5 session status không hợp lệ"
    );
  }

  if (
    !Number.isFinite(
      new Date(
        session.expires_at
      ).getTime()
    )
  ) {
    fail(
      "Block Puzzle V5 session expiry không hợp lệ"
    );
  }

  if (
    !Number.isSafeInteger(
      session.continue_count
    ) ||
    session.continue_count < 0 ||
    session.continue_count > 5
  ) {
    fail(
      "Block Puzzle V5 continue_count không hợp lệ"
    );
  }

  return session;
}

function normalizeV5ReviveResult(row) {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row)
  ) {
    fail(
      "Block Puzzle V5 revive response không hợp lệ"
    );
  }

  /*
   * bigint ledger IDs must not silently lose
   * precision during JavaScript normalization.
   */

  const rawCreditTransactionId =
    row.credit_transaction_id;

  if (
    typeof rawCreditTransactionId ===
      "number" &&
    !Number.isSafeInteger(
      rawCreditTransactionId
    )
  ) {
    fail(
      "Block Puzzle V5 credit transaction ID mất độ chính xác"
    );
  }

  const creditTransactionId =
    String(
      rawCreditTransactionId ?? ""
    );

  const result = {
    purchase_id:
      String(row.purchase_id || ""),

    session_id:
      String(row.session_id || ""),

    continue_index:
      Number(row.continue_index),

    credit_cost:
      Number(row.credit_cost),

    credit_transaction_id:
      creditTransactionId,

    balance_before:
      Number(row.balance_before),

    balance_after:
      Number(row.balance_after),

    continue_count:
      Number(row.continue_count),

    verified_replay_fingerprint:
      String(
        row.verified_replay_fingerprint ||
        ""
      ),

    created_at:
      row.created_at,

    idempotent:
      row.idempotent,
  };

  if (
    !UUID_V4_RE.test(
      result.purchase_id
    ) ||
    !UUID_V4_RE.test(
      result.session_id
    )
  ) {
    fail(
      "Block Puzzle V5 purchase identity không hợp lệ"
    );
  }

  if (
    !/^[1-9][0-9]*$/.test(
      creditTransactionId
    ) ||
    BigInt(
      creditTransactionId
    ) > 9223372036854775807n
  ) {
    fail(
      "Block Puzzle V5 credit transaction ID không hợp lệ"
    );
  }

  if (
    !Number.isSafeInteger(
      result.continue_index
    ) ||
    result.continue_index < 1 ||
    result.continue_index > 5
  ) {
    fail(
      "Block Puzzle V5 continue index không hợp lệ"
    );
  }

  if (
    result.credit_cost !==
      V5_CREDIT_COSTS[
        result.continue_index
      ]
  ) {
    fail(
      "Block Puzzle V5 credit cost không hợp lệ"
    );
  }

  for (
    const field of [
      "balance_before",
      "balance_after",
      "continue_count",
    ]
  ) {
    if (
      !Number.isSafeInteger(
        result[field]
      ) ||
      result[field] < 0
    ) {
      fail(
        `Block Puzzle V5 ${field} không hợp lệ`
      );
    }
  }

  if (
    result.continue_count !==
      result.continue_index ||
    result.balance_after !==
      result.balance_before -
        result.credit_cost
  ) {
    fail(
      "Block Puzzle V5 financial invariant không khớp"
    );
  }

  if (
    !FINGERPRINT_RE.test(
      result.verified_replay_fingerprint
    )
  ) {
    fail(
      "Block Puzzle V5 fingerprint không hợp lệ"
    );
  }

  if (
    !Number.isFinite(
      new Date(
        result.created_at
      ).getTime()
    )
  ) {
    fail(
      "Block Puzzle V5 receipt timestamp không hợp lệ"
    );
  }

  if (
    typeof result.idempotent !==
      "boolean"
  ) {
    fail(
      "Block Puzzle V5 idempotency flag không hợp lệ"
    );
  }

  return Object.freeze(result);
}

module.exports = {
  V5_CREDIT_COSTS,
  normalizeV5ReviveSessionRow,
  normalizeV5ReviveResult,
};

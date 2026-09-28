"use strict";

const {
  normalizePhone,
} = require("../../../utils/phoneIdentity");

const {
  startOfflineReviveSession,
  markOfflineRevivePending,
  applyOfflineRevival,
  abandonOfflineReviveSession,
  finalizeOfflineReviveSession,
  readOfflineReviveCreditBalance,
  recoverOfflineReviveSession,
  readOfflineRevivePendingEvent,
} = require("./repositories/cingOfflineReviveRepository");

/*
 * CING GAME CENTER V2
 *
 * Authenticated service boundary for the
 * Stack Tower and Black Pearl Rush
 * PostgreSQL revival authorities.
 *
 * The authenticated customer is supplied
 * by the existing authMiddleware.
 *
 * No balance, ledger or session mutation
 * is implemented in JavaScript.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_PG_BIGINT =
  9223372036854775807n;

const ERROR_STATUSES = Object.freeze({

  // Invalid request or unsupported game.
  REVIVAL_USER_REQUIRED: 400,
  REVIVAL_REQUEST_ID_REQUIRED: 400,
  REVIVAL_GAME_NOT_SUPPORTED: 400,
  REVIVAL_PENDING_ARGUMENT_INVALID: 400,
  REVIVAL_PENDING_REASON_INVALID: 400,
  REVIVAL_GAME_REASON_MISMATCH: 400,
  REVIVAL_APPLY_ARGUMENT_INVALID: 400,

  // Authenticated member has no matching player.
  REVIVAL_PLAYER_NOT_FOUND: 404,
  REVIVE_PLAYER_NOT_FOUND: 404,

  // Session is missing or does not belong
  // to the authenticated member.
  REVIVAL_SESSION_NOT_FOUND: 404,

  // Business-state and idempotency conflicts.
  REVIVAL_START_REFERENCE_CONFLICT: 409,
  REVIVAL_PENDING_REFERENCE_CONFLICT: 409,
  REVIVAL_APPLY_REFERENCE_CONFLICT: 409,
  REVIVAL_EVENT_SEQUENCE_CONFLICT: 409,
  REVIVAL_PENDING_EVENT_MISMATCH: 409,
  REVIVAL_SESSION_EXPIRED: 409,
  REVIVAL_SESSION_NOT_ACTIVE: 409,
  REVIVAL_SESSION_NOT_PENDING: 409,
  REVIVAL_TOWER_NOT_TIMED_OUT: 409,
  REVIVAL_LIMIT_REACHED: 409,
  INSUFFICIENT_REVIVE_CREDITS: 409,
  REVIVE_REFERENCE_CONFLICT: 409,

  // Internal consistency errors.
  REVIVAL_START_REPLAY_NOT_FOUND: 500,
  REVIVAL_TIMER_HISTORY_MISSING: 500,
  REVIVAL_APPLY_HISTORY_INCONSISTENT: 500,
  REVIVAL_COST_INVALID: 500,
  REVIVAL_CREDIT_APPLY_INCONSISTENT: 500,
  REVIVE_BALANCE_ROW_MISSING: 500,
  REVIVE_BALANCE_OVERFLOW: 500,

  // Repository contract violation.
  REVIVAL_RPC_INVALID_PAYLOAD: 500,

  // Finalize validation and lifecycle.
  REVIVAL_FINALIZE_ARGUMENT_INVALID: 400,
  REVIVAL_FINALIZE_REQUEST_CONFLICT: 409,
  REVIVAL_SESSION_ALREADY_FINALIZED: 409,
  REVIVAL_FINALIZE_STATE_CONFLICT: 409,

  // Lost-canvas session closure.
  REVIVAL_ABANDON_ARGUMENT_INVALID: 400,
  REVIVAL_ABANDON_REQUEST_CONFLICT: 409,
  REVIVAL_ABANDON_SEQUENCE_CONFLICT: 409,
  REVIVAL_ABANDON_STATE_CONFLICT: 409,

  // Finalize database consistency.
  REVIVAL_FINALIZE_SCORE_INCONSISTENT: 500,
  REVIVAL_FINALIZE_REPLAY_INCONSISTENT: 500,

});

function serviceError(
  code,
  statusCode,
  message
) {
  const error = new Error(message);

  error.code = code;
  error.statusCode = statusCode;

  return error;
}

function resolveAuthenticatedUserId(
  customer
) {
  const phone = normalizePhone(
    customer?.phone || ""
  );

  if (!phone) {
    throw serviceError(
      "REVIVAL_MEMBER_IDENTITY_REQUIRED",
      401,
      "Không xác định được tài khoản thành viên"
    );
  }

  return phone;
}

function normalizeUuid(
  value,
  field
) {
  if (
    typeof value !== "string" ||
    !UUID_PATTERN.test(value.trim())
  ) {
    throw serviceError(
      "REVIVAL_INVALID_UUID",
      400,
      `${field} không hợp lệ`
    );
  }

  return value.trim().toLowerCase();
}

function normalizeGameKey(
  value
) {
  if (
    value !== "cing-stack-tower" &&
    value !== "black-pearl-rush"
  ) {
    throw serviceError(
      "REVIVAL_GAME_NOT_SUPPORTED",
      400,
      "Trò chơi không hỗ trợ session hồi sinh này"
    );
  }

  return value;
}

function normalizeEventSeq(
  value,
  minimum
) {
  if (
    !Number.isInteger(value) ||
    value < minimum ||
    value >= 2147483647
  ) {
    throw serviceError(
      "REVIVAL_INVALID_EVENT_SEQUENCE",
      400,
      "event_seq không hợp lệ"
    );
  }

  return value;
}

function normalizePendingReason(
  value
) {
  if (
    value !== "death" &&
    value !== "timeout"
  ) {
    throw serviceError(
      "REVIVAL_PENDING_REASON_INVALID",
      400,
      "Lý do chờ hồi sinh không hợp lệ"
    );
  }

  return value;
}

function normalizePendingEventId(
  value
) {
  let text;

  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  ) {
    text = String(value);
  } else if (
    typeof value === "string" &&
    /^[0-9]+$/.test(value)
  ) {
    text = value;
  } else {
    throw serviceError(
      "REVIVAL_INVALID_PENDING_EVENT_ID",
      400,
      "pending_event_id không hợp lệ"
    );
  }

  const parsed = BigInt(text);

  if (
    parsed < 1n ||
    parsed > MAX_PG_BIGINT
  ) {
    throw serviceError(
      "REVIVAL_INVALID_PENDING_EVENT_ID",
      400,
      "pending_event_id không hợp lệ"
    );
  }

  /*
   * Supabase/PostgREST accepts the bigint
   * parameter in decimal string form.
   * Never round a database event ID.
   */

  return parsed.toString();
}

function mapRevivalError(
  error
) {
  /*
   * Preserve errors already validated
   * by this service.
   */

  if (
    error instanceof Error &&
    error.statusCode &&
    typeof error.code === "string"
  ) {
    return error;
  }

  const message = String(
    error?.message || ""
  );

  /*
   * Match explicit SQL business codes,
   * not generic PostgreSQL SQLSTATE
   * such as P0001 or 23505.
   */

  const businessCode =
    Object.keys(ERROR_STATUSES)
      .find((code) => {
        const escaped = code.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

        return new RegExp(
          `(^|[^A-Z0-9_])${escaped}($|[^A-Z0-9_])`
        ).test(message);
      });

  if (!businessCode) {
    return serviceError(
      "REVIVAL_SERVICE_FAILED",
      500,
      "Không thể xử lý yêu cầu hồi sinh"
    );
  }

  const statusCode =
    ERROR_STATUSES[businessCode];

  /*
   * Internal PostgreSQL state must never
   * leak into the customer API.
   */

  if (statusCode === 500) {
    return serviceError(
      businessCode,
      500,
      "Không thể xử lý yêu cầu hồi sinh"
    );
  }

  return serviceError(
    businessCode,
    statusCode,
    businessCode
  );
}

async function executeRevivalOperation(
  operation
) {
  try {
    return await operation();
  } catch (error) {
    throw mapRevivalError(error);
  }
}

async function startOfflineRevival({
  customer,
  requestId,
  gameKey,
}) {
  const userId =
    resolveAuthenticatedUserId(customer);

  const normalizedRequestId =
    normalizeUuid(
      requestId,
      "request_id"
    );

  const normalizedGameKey =
    normalizeGameKey(gameKey);

  return executeRevivalOperation(
    () => startOfflineReviveSession({
      userId,
      requestId: normalizedRequestId,
      gameKey: normalizedGameKey,
    })
  );
}

async function enterOfflineRevivePending({
  customer,
  sessionId,
  requestId,
  expectedEventSeq,
  reason,
}) {
  const userId =
    resolveAuthenticatedUserId(customer);

  const normalizedSessionId =
    normalizeUuid(
      sessionId,
      "session_id"
    );

  const normalizedRequestId =
    normalizeUuid(
      requestId,
      "request_id"
    );

  const normalizedEventSeq =
    normalizeEventSeq(
      expectedEventSeq,
      0
    );

  const normalizedReason =
    normalizePendingReason(reason);

  return executeRevivalOperation(
    () => markOfflineRevivePending({
      userId,
      sessionId: normalizedSessionId,
      requestId: normalizedRequestId,
      expectedEventSeq:
        normalizedEventSeq,
      reason: normalizedReason,
    })
  );
}

async function purchaseOfflineRevival({
  customer,
  sessionId,
  requestId,
  expectedEventSeq,
  pendingEventId,
}) {
  const userId =
    resolveAuthenticatedUserId(customer);

  const normalizedSessionId =
    normalizeUuid(
      sessionId,
      "session_id"
    );

  const normalizedRequestId =
    normalizeUuid(
      requestId,
      "request_id"
    );

  const normalizedEventSeq =
    normalizeEventSeq(
      expectedEventSeq,
      1
    );

  const normalizedPendingEventId =
    normalizePendingEventId(
      pendingEventId
    );

  /*
   * No client-provided credit cost.
   * No JavaScript-side balance mutation.
   */

  return executeRevivalOperation(
    () => applyOfflineRevival({
      userId,
      sessionId: normalizedSessionId,
      requestId: normalizedRequestId,
      expectedEventSeq:
        normalizedEventSeq,
      pendingEventId:
        normalizedPendingEventId,
    })
  );
}

async function abandonOfflineRevival({
  customer,
  sessionId,
  requestId,
  expectedEventSeq,
}) {
  const userId =
    resolveAuthenticatedUserId(customer);

  const normalizedSessionId =
    normalizeUuid(
      sessionId,
      "session_id"
    );

  const normalizedRequestId =
    normalizeUuid(
      requestId,
      "request_id"
    );

  const normalizedEventSeq =
    normalizeEventSeq(
      expectedEventSeq,
      0
    );

  const receipt =
    await executeRevivalOperation(
      () => abandonOfflineReviveSession({
        userId,
        sessionId: normalizedSessionId,
        requestId: normalizedRequestId,
        expectedEventSeq:
          normalizedEventSeq,
      })
    );

  if (
    !receipt ||
    receipt.session_id !==
      normalizedSessionId ||
    receipt.session_status !==
      "abandoned" ||
    receipt.event_seq !==
      normalizedEventSeq ||
    !Number.isInteger(
      receipt.revives_used
    ) ||
    receipt.revives_used < 0 ||
    receipt.revives_used > 5 ||
    typeof receipt.abandoned_at !==
      "string" ||
    !Number.isFinite(
      Date.parse(receipt.abandoned_at)
    )
  ) {
    throw serviceError(
      "REVIVAL_ABANDON_RECEIPT_INVALID",
      500,
      "Không thể xác minh việc kết thúc phiên cũ"
    );
  }

  return receipt;
}


function normalizeFinalResultInteger(
  value,
  field
) {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > 1000000
  ) {
    throw serviceError(
      "REVIVAL_INVALID_FINAL_RESULT",
      400,
      `${field} không hợp lệ`
    );
  }

  return value;
}

function normalizeFinalPlayerName(value) {
  if (
    value !== undefined &&
    value !== null &&
    typeof value !== "string"
  ) {
    throw serviceError(
      "REVIVAL_INVALID_PLAYER_NAME",
      400,
      "player_name không hợp lệ"
    );
  }

  const name =
    String(value || "").trim();

  if (name.length > 100) {
    throw serviceError(
      "REVIVAL_INVALID_PLAYER_NAME",
      400,
      "player_name quá dài"
    );
  }

  return name || "Cing iu";
}

function normalizeFinalAvatar(value) {
  if (
    value !== undefined &&
    value !== null &&
    typeof value !== "string"
  ) {
    throw serviceError(
      "REVIVAL_INVALID_AVATAR",
      400,
      "avatar không hợp lệ"
    );
  }

  const avatar = String(value || "");

  if (avatar.length > 2048) {
    throw serviceError(
      "REVIVAL_INVALID_AVATAR",
      400,
      "avatar quá dài"
    );
  }

  return avatar;
}

async function finalizeOfflineRevival({
  customer,
  sessionId,
  requestId,
  expectedEventSeq,
  finalScore,
  finalBestCombo,
  playerName,
  avatar,
}) {
  const userId =
    resolveAuthenticatedUserId(customer);

  const normalizedSessionId =
    normalizeUuid(sessionId,
      "session_id");

  const normalizedRequestId =
    normalizeUuid(requestId,
      "request_id");

  const normalizedEventSeq =
    normalizeEventSeq(
      expectedEventSeq,
      1
    );

  const normalizedScore =
    normalizeFinalResultInteger(
      finalScore,
      "final_score"
    );

  const normalizedCombo =
    normalizeFinalResultInteger(
      finalBestCombo,
      "final_best_combo"
    );

  const normalizedName =
    normalizeFinalPlayerName(playerName);

  const normalizedAvatar =
    normalizeFinalAvatar(avatar);

  return executeRevivalOperation(
    () => finalizeOfflineReviveSession({
      userId,
      sessionId: normalizedSessionId,
      requestId: normalizedRequestId,
      expectedEventSeq:
        normalizedEventSeq,
      finalScore: normalizedScore,
      finalBestCombo: normalizedCombo,
      playerName: normalizedName,
      avatar: normalizedAvatar,
    })
  );
}


/*
 * Authenticated read-only Game Center V2 authority.
 *
 * Reads never start a new game, consume game plays,
 * purchase revivals or finalize scores.
 */

async function getOfflineReviveCreditBalance({
  customer,
}) {
  const userId =
    resolveAuthenticatedUserId(customer);

  const balance =
    await readOfflineReviveCreditBalance({
      userId,
    });

  if (
    !Number.isSafeInteger(balance) ||
    balance < 0
  ) {
    throw serviceError(
      "REVIVAL_READ_BALANCE_INVALID",
      500,
      "Không thể đọc số dư hồi sinh"
    );
  }

  return {
    balance,
  };
}

async function recoverOfflineRevival({
  customer,
  requestId,
}) {
  const userId =
    resolveAuthenticatedUserId(customer);

  const normalizedRequestId =
    normalizeUuid(
      requestId,
      "request_id"
    );

  const session =
    await recoverOfflineReviveSession({
      userId,
      requestId: normalizedRequestId,
    });

  if (!session) {
    throw serviceError(
      "REVIVAL_SESSION_NOT_FOUND",
      404,
      "Không tìm thấy phiên chơi"
    );
  }

  if (
    session.user_id !== userId ||
    String(session.request_id).toLowerCase() !==
      normalizedRequestId
  ) {
    throw serviceError(
      "REVIVAL_READ_IDENTITY_MISMATCH",
      500,
      "Không thể xác minh phiên chơi"
    );
  }

  if (
    session.game_key !== "cing-stack-tower" &&
    session.game_key !== "black-pearl-rush"
  ) {
    throw serviceError(
      "REVIVAL_READ_GAME_INVALID",
      500,
      "Phiên chơi không hợp lệ"
    );
  }

  if (
    session.status !== "active" &&
    session.status !== "revive_pending" &&
    session.status !== "finalized" &&
    session.status !== "abandoned"
  ) {
    throw serviceError(
      "REVIVAL_READ_STATE_INVALID",
      500,
      "Trạng thái phiên chơi không hợp lệ"
    );
  }

  if (
    !Number.isInteger(session.event_seq) ||
    session.event_seq < 0 ||
    !Number.isInteger(session.revives_used) ||
    session.revives_used < 0 ||
    session.revives_used > 5
  ) {
    throw serviceError(
      "REVIVAL_READ_SEQUENCE_INVALID",
      500,
      "Lịch sử phiên chơi không hợp lệ"
    );
  }

  let pendingEvent = null;

  if (session.status === "revive_pending") {
    pendingEvent =
      await readOfflineRevivePendingEvent({
        userId,
        sessionId: session.id,
        eventSeq: session.event_seq,
      });

    if (
      !pendingEvent ||
      pendingEvent.session_id !== session.id ||
      pendingEvent.user_id !== userId ||
      pendingEvent.event_seq !== session.event_seq ||
      pendingEvent.event_type !== "revive_pending" ||
      pendingEvent.pending_reason !==
        session.pending_reason
    ) {
      throw serviceError(
        "REVIVAL_READ_PENDING_INCONSISTENT",
        500,
        "Không thể khôi phục trạng thái hồi sinh"
      );
    }

    /*
     * PostgreSQL bigint may exceed JS safe integer.
     * Return it as a decimal string, never as
     * an imprecise Number.
     */
    const eventId =
      pendingEvent.id;

    if (
      !(
        typeof eventId === "string" &&
        /^[1-9][0-9]*$/.test(eventId) &&
        BigInt(eventId) <=
          9223372036854775807n
      ) &&
      !(
        typeof eventId === "number" &&
        Number.isSafeInteger(eventId) &&
        eventId > 0
      )
    ) {
      throw serviceError(
        "REVIVAL_READ_PENDING_ID_INVALID",
        500,
        "Mã sự kiện hồi sinh không hợp lệ"
      );
    }

    pendingEvent = {
      event_id: String(eventId),
      event_seq:
        pendingEvent.event_seq,
      reason:
        pendingEvent.pending_reason,
    };
  }

  return {
    session_id: session.id,
    request_id: normalizedRequestId,
    game_key: session.game_key,
    session_status: session.status,
    revives_used: session.revives_used,
    event_seq: session.event_seq,
    pending_reason:
      session.pending_reason ?? null,
    pending_at:
      session.pending_at ?? null,
    created_at: session.created_at,
    expires_at: session.expires_at,
    finalized_at:
      session.finalized_at ?? null,
    abandoned_at:
      session.abandoned_at ?? null,
    pending_event: pendingEvent,
  };
}

module.exports = {
  startOfflineRevival,
  enterOfflineRevivePending,
  purchaseOfflineRevival,
  abandonOfflineRevival,
  finalizeOfflineRevival,
  getOfflineReviveCreditBalance,
  recoverOfflineRevival,
};

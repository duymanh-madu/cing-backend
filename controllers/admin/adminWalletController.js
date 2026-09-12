const {
  getTopupPromotion,
  configureTopupPromotion,
  getWalletSummary,
  getWalletTransactions,
  adjustWalletBalance,
  searchWalletCustomers,
} = require(
  "../../services/wallet/walletAdminService"
);

const MAX_TIERS = 50;
const MAX_NAME_LENGTH = 160;
const MAX_ACTOR_LENGTH = 512;
const MAX_ADJUSTMENT_NOTE_LENGTH = 1000;
const MAX_ADJUSTMENT_REFERENCE_TYPE_LENGTH = 100;
const MAX_ADJUSTMENT_REFERENCE_ID_LENGTH = 300;


function badRequest(
  res,
  error
) {
  return res.status(400).json({
    success: false,
    error,
  });
}

function isPlainObject(
  value
) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isPositiveIntegerString(
  value
) {
  return (
    typeof value === "string" &&
    /^[1-9][0-9]*$/.test(value)
  );
}

function normalizePositiveBigint(
  value,
  field
) {
  if (
    typeof value === "number"
  ) {
    if (
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      throw new Error(
        `${field}_INVALID`
      );
    }

    return String(value);
  }

  if (
    isPositiveIntegerString(value)
  ) {
    try {
      const parsed =
        BigInt(value);

      if (
        parsed >
        9223372036854775807n
      ) {
        throw new Error();
      }

      return value;
    } catch {
      throw new Error(
        `${field}_INVALID`
      );
    }
  }

  throw new Error(
    `${field}_INVALID`
  );
}

function normalizeOptionalTimestamp(
  value,
  field
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !== "string"
  ) {
    throw new Error(
      `${field}_INVALID`
    );
  }

  const parsed =
    Date.parse(value);

  if (
    Number.isNaN(parsed)
  ) {
    throw new Error(
      `${field}_INVALID`
    );
  }

  return new Date(
    parsed
  ).toISOString();
}

function resolveActorId(
  req
) {
  const admin =
    req.admin || {};

  const candidates = [
    admin.user_id,
    admin.zalo_user_id,
    admin.id,
  ];

  const actor =
    candidates.find(
      (value) =>
        (
          typeof value === "string" &&
          value.trim()
        ) ||
        (
          typeof value === "number" &&
          Number.isSafeInteger(value)
        )
    );

  if (
    actor === undefined ||
    actor === null
  ) {
    return null;
  }

  const normalized =
    String(actor).trim();

  if (!normalized) {
    return null;
  }

  if (
    normalized.length >
    MAX_ACTOR_LENGTH
  ) {
    return normalized.slice(
      0,
      MAX_ACTOR_LENGTH
    );
  }

  return normalized;
}


function normalizeRequiredText(
  value,
  {
    code,
    maxLength,
    pattern = null,
  }
) {
  if (
    typeof value !==
      "string"
  ) {
    throw new Error(code);
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      maxLength ||
    (
      pattern &&
      !pattern.test(
        normalized
      )
    )
  ) {
    throw new Error(code);
  }

  return normalized;
}

function normalizeOptionalText(
  value,
  {
    code,
    maxLength,
    pattern = null,
  }
) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value !==
      "string"
  ) {
    throw new Error(code);
  }

  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length >
      maxLength ||
    (
      pattern &&
      !pattern.test(
        normalized
      )
    )
  ) {
    throw new Error(code);
  }

  return normalized;
}

function normalizeRequestUuid(
  value
) {
  return normalizeRequiredText(
    value,
    {
      code:
        "CING_WALLET_ADMIN_ADJUSTMENT_REQUEST_ID_INVALID",
      maxLength:
        36,
      pattern:
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    }
  ).toLowerCase();
}

async function createAdjustment(
  req,
  res
) {
  try {
    if (
      req.admin?.role !==
        "super_admin"
    ) {
      return res.status(403).json({
        success:
          false,
        error:
          "CING_WALLET_SUPER_ADMIN_REQUIRED",
      });
    }

    if (
      !isPlainObject(
        req.body
      )
    ) {
      return badRequest(
        res,
        "CING_WALLET_ADMIN_ADJUSTMENT_BODY_INVALID"
      );
    }

    const allowedKeys =
      new Set([
        "user_id",
        "direction",
        "amount",
        "request_id",
        "reason_code",
        "note",
        "reference_type",
        "reference_id",
      ]);

    const unknownKey =
      Object
        .keys(req.body)
        .find(
          key =>
            !allowedKeys.has(
              key
            )
        );

    if (unknownKey) {
      return badRequest(
        res,
        "CING_WALLET_ADMIN_ADJUSTMENT_BODY_INVALID"
      );
    }

    const userId =
      normalizeRequiredText(
        req.body.user_id,
        {
          code:
            "CING_WALLET_ADMIN_ADJUSTMENT_USER_ID_INVALID",
          maxLength:
            200,
        }
      );

    const direction =
      normalizeRequiredText(
        req.body.direction,
        {
          code:
            "CING_WALLET_ADMIN_ADJUSTMENT_DIRECTION_INVALID",
          maxLength:
            6,
          pattern:
            /^(credit|debit)$/,
        }
      ).toLowerCase();

    const amount =
      normalizePositiveBigint(
        req.body.amount,
        "CING_WALLET_ADMIN_ADJUSTMENT_AMOUNT"
      );

    const requestId =
      normalizeRequestUuid(
        req.body.request_id
      );

    const reasonCode =
      normalizeRequiredText(
        req.body.reason_code,
        {
          code:
            "CING_WALLET_ADMIN_ADJUSTMENT_REASON_CODE_INVALID",
          maxLength:
            64,
          pattern:
            /^[a-z0-9][a-z0-9_]{1,63}$/,
        }
      ).toLowerCase();

    const note =
      normalizeOptionalText(
        req.body.note,
        {
          code:
            "CING_WALLET_ADMIN_ADJUSTMENT_NOTE_INVALID",
          maxLength:
            MAX_ADJUSTMENT_NOTE_LENGTH,
        }
      );

    const referenceType =
      normalizeOptionalText(
        req.body.reference_type,
        {
          code:
            "CING_WALLET_ADMIN_ADJUSTMENT_REFERENCE_INVALID",
          maxLength:
            MAX_ADJUSTMENT_REFERENCE_TYPE_LENGTH,
          pattern:
            /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/,
        }
      );

    const referenceId =
      normalizeOptionalText(
        req.body.reference_id,
        {
          code:
            "CING_WALLET_ADMIN_ADJUSTMENT_REFERENCE_INVALID",
          maxLength:
            MAX_ADJUSTMENT_REFERENCE_ID_LENGTH,
        }
      );

    if (
      Boolean(referenceType) !==
      Boolean(referenceId)
    ) {
      return badRequest(
        res,
        "CING_WALLET_ADMIN_ADJUSTMENT_REFERENCE_INVALID"
      );
    }

    const actorId =
      resolveActorId(req);

    if (!actorId) {
      return res.status(403).json({
        success:
          false,
        error:
          "CING_WALLET_ADMIN_ACTOR_MISSING",
      });
    }

    const adjustment =
      await adjustWalletBalance({
        user_id:
          userId,
        direction,
        amount,
        request_id:
          requestId,
        reason_code:
          reasonCode,
        note,
        reference_type:
          referenceType,
        reference_id:
          referenceId,
        actor_id:
          actorId,
      });

    return res.json({
      success:
        true,
      data:
        adjustment,
    });
  } catch (error) {
    const message =
      error?.message ||
      "";

    if (
      message.startsWith(
        "CING_WALLET_ADMIN_ADJUSTMENT_"
      ) &&
      !message.includes(
        "REPLAY_CONFLICT"
      )
    ) {
      return badRequest(
        res,
        message
      );
    }

    if (
      message.includes(
        "CING_WALLET_INSUFFICIENT_BALANCE"
      )
    ) {
      return res.status(409).json({
        success:
          false,
        error:
          "CING_WALLET_INSUFFICIENT_BALANCE",
      });
    }

    if (
      message.includes(
        "CING_WALLET_ADMIN_ADJUSTMENT_REPLAY_CONFLICT"
      )
    ) {
      return res.status(409).json({
        success:
          false,
        error:
          "CING_WALLET_ADMIN_ADJUSTMENT_REPLAY_CONFLICT",
      });
    }

    if (
      message.includes(
        "CING_WALLET_USER_NOT_FOUND"
      )
    ) {
      return res.status(404).json({
        success:
          false,
        error:
          "CING_WALLET_USER_NOT_FOUND",
      });
    }

    if (
      message.includes(
        "CING_WALLET_ACCOUNT"
      )
    ) {
      return res.status(409).json({
        success:
          false,
        error:
          message,
      });
    }

    return mapWalletError(
      res,
      error
    );
  }
}


async function getAdjustmentCustomers(
  req,
  res
) {
  try {
    if (
      req.admin?.role !==
        "super_admin"
    ) {
      return res.status(403).json({
        success:
          false,
        error:
          "CING_WALLET_SUPER_ADMIN_REQUIRED",
      });
    }

    const query =
      typeof req.query?.q ===
        "string"
        ? req.query.q.trim()
        : "";

    if (
      query.length < 2 ||
      query.length > 120
    ) {
      return badRequest(
        res,
        "CING_WALLET_ADMIN_CUSTOMER_QUERY_INVALID"
      );
    }

    const rows =
      await searchWalletCustomers({
        query,
      });

    const items =
      rows.map(
        row => {
          const balance =
            Number(
              row
                ?.wallet_balance
            );

          if (
            typeof row?.user_id !==
              "string" ||
            !row.user_id ||
            !Number.isSafeInteger(
              balance
            ) ||
            balance < 0 ||
            typeof row
              ?.wallet_account_exists !==
              "boolean"
          ) {
            throw new Error(
              "CING_WALLET_ADMIN_CUSTOMER_LOOKUP_RESULT_INVALID"
            );
          }

          return {
            user_id:
              row.user_id,
            phone:
              typeof row?.phone ===
                "string"
                ? row.phone
                : row.user_id,
            display_name:
              typeof row
                ?.display_name ===
                "string"
                ? row.display_name
                : row.user_id,
            avatar:
              typeof row?.avatar ===
                "string"
                ? row.avatar
                : "",
            wallet_balance:
              balance,
            wallet_status:
              typeof row
                ?.wallet_status ===
                "string"
                ? row.wallet_status
                : "not_created",
            wallet_account_exists:
              row
                .wallet_account_exists,
          };
        }
      );

    return res.json({
      success:
        true,
      data: {
        items,
      },
    });
  } catch (error) {
    const message =
      error?.message ||
      "";

    if (
      message ===
        "CING_WALLET_ADMIN_CUSTOMER_QUERY_INVALID"
    ) {
      return badRequest(
        res,
        message
      );
    }

    return mapWalletError(
      res,
      error
    );
  }
}

function mapWalletError(
  res,
  error
) {
  const code =
    error?.code || "";

  const message =
    error?.message ||
    "CING_WALLET_ADMIN_HTTP_FAILED";

  if (
    code === "22023" ||
    message.startsWith(
      "CING_WALLET_PROMOTION_"
    ) ||
    message ===
      "CING_WALLET_REPORT_TIME_RANGE_INVALID"
  ) {
    return res.status(400).json({
      success: false,
      error: message,
    });
  }

  console.error(
    "admin wallet error:",
    message
  );

  return res.status(500).json({
    success: false,
    error:
      "CING_WALLET_ADMIN_INTERNAL_ERROR",
  });
}

async function getPromotion(
  req,
  res
) {
  try {
    const promotion =
      await getTopupPromotion();

    return res.json({
      success: true,
      data: promotion,
    });
  } catch (error) {
    return mapWalletError(
      res,
      error
    );
  }
}

async function updatePromotion(
  req,
  res
) {
  try {
    if (
      !isPlainObject(req.body)
    ) {
      return badRequest(
        res,
        "CING_WALLET_PROMOTION_BODY_INVALID"
      );
    }

    const allowedKeys =
      new Set([
        "enabled",
        "name",
        "starts_at",
        "ends_at",
        "tiers",
      ]);

    const unknownKey =
      Object.keys(
        req.body
      ).find(
        (key) =>
          !allowedKeys.has(key)
      );

    if (unknownKey) {
      return badRequest(
        res,
        "CING_WALLET_PROMOTION_BODY_INVALID"
      );
    }

    const {
      enabled,
      name,
      starts_at,
      ends_at,
      tiers,
    } = req.body;

    if (
      typeof enabled !== "boolean"
    ) {
      return badRequest(
        res,
        "CING_WALLET_PROMOTION_ENABLED_INVALID"
      );
    }

    if (
      name !== undefined &&
      name !== null &&
      typeof name !== "string"
    ) {
      return badRequest(
        res,
        "CING_WALLET_PROMOTION_NAME_INVALID"
      );
    }

    const normalizedName =
      typeof name === "string"
        ? name.trim()
        : null;

    if (
      normalizedName &&
      normalizedName.length >
        MAX_NAME_LENGTH
    ) {
      return badRequest(
        res,
        "CING_WALLET_PROMOTION_NAME_INVALID"
      );
    }

    if (
      !Array.isArray(tiers) ||
      tiers.length > MAX_TIERS
    ) {
      return badRequest(
        res,
        "CING_WALLET_PROMOTION_TIERS_INVALID"
      );
    }

    const normalizedTiers =
      tiers.map(
        (
          tier
        ) => {
          if (
            !isPlainObject(tier)
          ) {
            throw new Error(
              "CING_WALLET_PROMOTION_TIER_INVALID"
            );
          }

          const tierKeys =
            Object.keys(tier);

          const allowedTierKeys =
            new Set([
              "min_topup_amount",
              "bonus_amount",
              "is_featured",
            ]);

          if (
            tierKeys.length < 2 ||
            tierKeys.length > 3 ||
            !tierKeys.includes(
              "min_topup_amount"
            ) ||
            !tierKeys.includes(
              "bonus_amount"
            ) ||
            tierKeys.some(
              key =>
                !allowedTierKeys.has(
                  key
                )
            ) ||
            (
              tierKeys.includes(
                "is_featured"
              ) &&
              typeof tier.is_featured !==
                "boolean"
            )
          ) {
            throw new Error(
              "CING_WALLET_PROMOTION_TIER_INVALID"
            );
          }

          return {
            min_topup_amount:
              normalizePositiveBigint(
                tier.min_topup_amount,
                "CING_WALLET_PROMOTION_TIER_MIN_TOPUP"
              ),

            bonus_amount:
              normalizePositiveBigint(
                tier.bonus_amount,
                "CING_WALLET_PROMOTION_TIER_BONUS"
              ),

            is_featured:
              tier.is_featured === true,
          };
        }
      );

    const seen =
      new Set();

    for (
      const tier
      of normalizedTiers
    ) {
      if (
        seen.has(
          tier.min_topup_amount
        )
      ) {
        return badRequest(
          res,
          "CING_WALLET_PROMOTION_TIER_DUPLICATE"
        );
      }

      seen.add(
        tier.min_topup_amount
      );
    }

    const featuredTierCount =
      normalizedTiers.filter(
        tier =>
          tier.is_featured === true
      ).length;

    if (
      featuredTierCount > 1
    ) {
      return badRequest(
        res,
        "CING_WALLET_PROMOTION_MULTIPLE_FEATURED_TIERS"
      );
    }

    if (
      enabled &&
      normalizedTiers.length === 0
    ) {
      return badRequest(
        res,
        "CING_WALLET_PROMOTION_ENABLED_WITHOUT_TIERS"
      );
    }

    const normalizedStartsAt =
      normalizeOptionalTimestamp(
        starts_at,
        "CING_WALLET_PROMOTION_STARTS_AT"
      );

    const normalizedEndsAt =
      normalizeOptionalTimestamp(
        ends_at,
        "CING_WALLET_PROMOTION_ENDS_AT"
      );

    if (
      normalizedStartsAt &&
      normalizedEndsAt &&
      Date.parse(
        normalizedEndsAt
      ) <=
        Date.parse(
          normalizedStartsAt
        )
    ) {
      return badRequest(
        res,
        "CING_WALLET_PROMOTION_TIME_WINDOW_INVALID"
      );
    }

    const actorId =
      resolveActorId(req);

    if (!actorId) {
      return res.status(403).json({
        success: false,
        error:
          "CING_WALLET_ADMIN_ACTOR_MISSING",
      });
    }

    const promotion =
      await configureTopupPromotion({
        enabled,
        name:
          normalizedName || null,
        starts_at:
          normalizedStartsAt,
        ends_at:
          normalizedEndsAt,
        tiers:
          normalizedTiers,
        actor_id:
          actorId,
      });

    return res.json({
      success: true,
      data: promotion,
    });
  } catch (error) {
    if (
      error?.message?.startsWith(
        "CING_WALLET_PROMOTION_TIER_"
      )
    ) {
      return badRequest(
        res,
        error.message
      );
    }

    return mapWalletError(
      res,
      error
    );
  }
}

async function getSummary(
  req,
  res
) {
  try {
    const from =
      normalizeOptionalTimestamp(
        req.query.from,
        "CING_WALLET_REPORT_FROM"
      );

    const to =
      normalizeOptionalTimestamp(
        req.query.to,
        "CING_WALLET_REPORT_TO"
      );

    if (
      from &&
      to &&
      Date.parse(to) <=
        Date.parse(from)
    ) {
      return badRequest(
        res,
        "CING_WALLET_REPORT_TIME_RANGE_INVALID"
      );
    }

    const summary =
      await getWalletSummary({
        from,
        to,
      });

    return res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    if (
      error?.message ===
        "CING_WALLET_REPORT_FROM_INVALID" ||
      error?.message ===
        "CING_WALLET_REPORT_TO_INVALID"
    ) {
      return badRequest(
        res,
        error.message
      );
    }

    return mapWalletError(
      res,
      error
    );
  }
}


const ADMIN_LEDGER_DEFAULT_LIMIT = 50;
const ADMIN_LEDGER_MAX_LIMIT = 100;

const ADMIN_LEDGER_TYPES =
  new Set([
    "topup",
    "topup_promotion",
    "payment",
    "refund",
    "reversal",
    "admin_adjustment",
  ]);

function encodeLedgerCursor(
  row
) {
  if (
    !row?.created_at ||
    !row?.id
  ) {
    return null;
  }

  return Buffer
    .from(
      JSON.stringify({
        created_at:
          row.created_at,
        id:
          row.id,
      }),
      "utf8"
    )
    .toString(
      "base64url"
    );
}

function decodeLedgerCursor(
  value
) {
  if (!value) {
    return null;
  }

  if (
    typeof value !==
      "string" ||
    value.length > 512
  ) {
    throw new Error(
      "CING_WALLET_ADMIN_LEDGER_CURSOR_INVALID"
    );
  }

  try {
    const decoded =
      JSON.parse(
        Buffer
          .from(
            value,
            "base64url"
          )
          .toString(
            "utf8"
          )
      );

    if (
      !isPlainObject(
        decoded
      ) ||
      typeof decoded
        .created_at !==
        "string" ||
      typeof decoded.id !==
        "string" ||
      Number.isNaN(
        Date.parse(
          decoded.created_at
        )
      ) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(
          decoded.id
        )
    ) {
      throw new Error();
    }

    return {
      created_at:
        new Date(
          decoded.created_at
        ).toISOString(),
      id:
        decoded.id,
    };
  } catch {
    throw new Error(
      "CING_WALLET_ADMIN_LEDGER_CURSOR_INVALID"
    );
  }
}

function normalizeLedgerLimit(
  value
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return ADMIN_LEDGER_DEFAULT_LIMIT;
  }

  if (
    typeof value !==
      "string" ||
    !/^[1-9][0-9]*$/.test(
      value
    )
  ) {
    throw new Error(
      "CING_WALLET_ADMIN_LEDGER_LIMIT_INVALID"
    );
  }

  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(
      parsed
    ) ||
    parsed >
      ADMIN_LEDGER_MAX_LIMIT
  ) {
    throw new Error(
      "CING_WALLET_ADMIN_LEDGER_LIMIT_INVALID"
    );
  }

  return parsed;
}

async function getTransactions(
  req,
  res
) {
  try {
    const limit =
      normalizeLedgerLimit(
        req.query?.limit
      );

    const cursor =
      decodeLedgerCursor(
        req.query?.cursor
      );

    const transactionType =
      req.query
        ?.transaction_type ||
      null;

    if (
      transactionType !==
        null &&
      (
        typeof transactionType !==
          "string" ||
        !ADMIN_LEDGER_TYPES.has(
          transactionType
        )
      )
    ) {
      return badRequest(
        res,
        "CING_WALLET_ADMIN_LEDGER_TYPE_INVALID"
      );
    }

    const rows =
      await getWalletTransactions({
        limit,
        before_created_at:
          cursor?.created_at ||
          null,
        before_id:
          cursor?.id ||
          null,
        transaction_type:
          transactionType,
      });

    if (
      !Array.isArray(rows)
    ) {
      throw new Error(
        "CING_WALLET_ADMIN_LEDGER_RESULT_INVALID"
      );
    }

    const hasMore =
      rows.length > limit;

    const items =
      hasMore
        ? rows.slice(
            0,
            limit
          )
        : rows;

    const tail =
      items[
        items.length - 1
      ] || null;

    return res.json({
      success: true,
      data: {
        items,
        next_cursor:
          hasMore
            ? encodeLedgerCursor(
                tail
              )
            : null,
      },
    });
  } catch (error) {
    const message =
      error?.message ||
      "";

    if (
      message ===
        "CING_WALLET_ADMIN_LEDGER_CURSOR_INVALID" ||
      message ===
        "CING_WALLET_ADMIN_LEDGER_LIMIT_INVALID" ||
      message ===
        "CING_WALLET_ADMIN_LEDGER_TYPE_INVALID"
    ) {
      return badRequest(
        res,
        message
      );
    }

    return mapWalletError(
      res,
      error
    );
  }
}

module.exports = {
  getPromotion,
  updatePromotion,
  getSummary,
  getTransactions,
  createAdjustment,
  getAdjustmentCustomers,
};

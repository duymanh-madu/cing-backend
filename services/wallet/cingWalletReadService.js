const supabase =
  require("../../supabase");

const {
  normalizePhone,
} = require(
  "../../utils/phoneIdentity"
);


const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;


/*
 * =====================================================
 * CING WALLET — READ AUTHORITY V1
 * =====================================================
 *
 * Identity authority:
 *
 * authenticated JWT
 *   -> authMiddleware
 *   -> req.customer
 *   -> customer.phone
 *   -> canonical players.user_id
 *
 * No public method accepts user_id from the caller.
 *
 * PostgreSQL remains financial authority. This service
 * performs backend-only SELECT operations through service_role.
 */


function createWalletReadError({
  message,
  code,
  statusCode,
}) {
  const error =
    new Error(
      message
    );

  error.code =
    code;

  error.statusCode =
    statusCode;

  return error;
}


function resolveWalletReadUserId(
  customer
) {
  const userId =
    normalizePhone(
      customer?.phone || ""
    );

  if (!userId) {
    throw createWalletReadError({
      message:
        "Không xác định được tài khoản thành viên",
      code:
        "CING_WALLET_MEMBER_IDENTITY_REQUIRED",
      statusCode:
        401,
    });
  }

  return userId;
}


function normalizePageSize(
  value
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return DEFAULT_PAGE_SIZE;
  }

  const raw =
    String(
      value
    ).trim();

  if (
    !/^[0-9]+$/.test(
      raw
    )
  ) {
    throw createWalletReadError({
      message:
        "Giới hạn lịch sử không hợp lệ",
      code:
        "CING_WALLET_HISTORY_LIMIT_INVALID",
      statusCode:
        400,
    });
  }

  const limit =
    Number(
      raw
    );

  if (
    !Number.isSafeInteger(
      limit
    ) ||
    limit < 1 ||
    limit > MAX_PAGE_SIZE
  ) {
    throw createWalletReadError({
      message:
        "Giới hạn lịch sử không hợp lệ",
      code:
        "CING_WALLET_HISTORY_LIMIT_INVALID",
      statusCode:
        400,
    });
  }

  return limit;
}


function encodeCursor(
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


function decodeCursor(
  value
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(
        Buffer
          .from(
            String(value),
            "base64url"
          )
          .toString(
            "utf8"
          )
      );

    const createdAt =
      String(
        parsed?.created_at || ""
      ).trim();

    const id =
      String(
        parsed?.id || ""
      ).trim();

    if (
      !createdAt ||
      Number.isNaN(
        Date.parse(
          createdAt
        )
      ) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id
      )
    ) {
      throw new Error(
        "invalid cursor"
      );
    }

    return {
      created_at:
        new Date(
          createdAt
        ).toISOString(),

      id,
    };
  } catch {
    throw createWalletReadError({
      message:
        "Con trỏ lịch sử không hợp lệ",
      code:
        "CING_WALLET_HISTORY_CURSOR_INVALID",
      statusCode:
        400,
    });
  }
}


async function assertCanonicalWalletPlayer(
  userId
) {
  const {
    data,
    error,
  } = await supabase
    .from(
      "players"
    )
    .select(
      "user_id"
    )
    .eq(
      "user_id",
      userId
    )
    .maybeSingle();

  if (error) {
    throw createWalletReadError({
      message:
        "Không thể xác thực tài khoản Cing Wallet",
      code:
        "CING_WALLET_PLAYER_LOOKUP_FAILED",
      statusCode:
        500,
    });
  }

  if (!data) {
    throw createWalletReadError({
      message:
        "Tài khoản thành viên không tồn tại",
      code:
        "CING_WALLET_PLAYER_NOT_FOUND",
      statusCode:
        404,
    });
  }

  if (
    String(
      data.user_id || ""
    ) !==
    userId
  ) {
    throw createWalletReadError({
      message:
        "Sai lệch định danh tài khoản Cing Wallet",
      code:
        "CING_WALLET_PLAYER_IDENTITY_MISMATCH",
      statusCode:
        500,
    });
  }
}


function normalizeWalletTransaction(
  row
) {
  return {
    id:
      row.id,

    transaction_type:
      row.transaction_type,

    amount:
      Number(
        row.amount
      ),

    balance_before:
      Number(
        row.balance_before
      ),

    balance_after:
      Number(
        row.balance_after
      ),

    reference_type:
      row.reference_type,

    reference_id:
      row.reference_id,

    reason:
      row.reason,

    note:
      row.note,

    created_at:
      row.created_at,
  };
}


async function readWalletAccountByUserId(
  userId
) {
  const {
    data,
    error,
  } = await supabase
    .from(
      "cing_wallet_accounts"
    )
    .select(
      "user_id,balance,status,created_at,updated_at"
    )
    .eq(
      "user_id",
      userId
    )
    .maybeSingle();

  if (error) {
    throw createWalletReadError({
      message:
        "Không thể đọc số dư Cing Wallet",
      code:
        "CING_WALLET_ACCOUNT_READ_FAILED",
      statusCode:
        500,
    });
  }

  /*
   * Wallet account rows are created lazily by mutation
   * authority. Reading Wallet must never mutate financial
   * state merely to manufacture an account row.
   *
   * No row therefore means canonical effective balance = 0.
   */
  if (!data) {
    return {
      account_created:
        false,

      balance:
        0,

      status:
        "active",

      created_at:
        null,

      updated_at:
        null,
    };
  }

  const balance =
    Number(
      data.balance
    );

  if (
    !Number.isSafeInteger(
      balance
    ) ||
    balance < 0
  ) {
    throw createWalletReadError({
      message:
        "Dữ liệu số dư Cing Wallet không hợp lệ",
      code:
        "CING_WALLET_BALANCE_INVALID",
      statusCode:
        500,
    });
  }

  return {
    account_created:
      true,

    balance,

    status:
      data.status,

    created_at:
      data.created_at,

    updated_at:
      data.updated_at,
  };
}


async function readWalletTransactionsByUserId({
  userId,
  limit,
  cursor,
}) {
  const pageSize =
    normalizePageSize(
      limit
    );

  const decodedCursor =
    decodeCursor(
      cursor
    );

  /*
   * Fetch one extra row so the API can determine whether
   * another page exists without issuing a count query.
   */
  let query =
    supabase
      .from(
        "cing_wallet_transactions"
      )
      .select(
        [
          "id",
          "user_id",
          "transaction_type",
          "amount",
          "balance_before",
          "balance_after",
          "reference_type",
          "reference_id",
          "reason",
          "note",
          "created_at",
        ].join(",")
      )
      .eq(
        "user_id",
        userId
      );

  if (
    decodedCursor
  ) {
    /*
     * Strict keyset predicate:
     *
     * created_at < cursor.created_at
     * OR
     * (
     *   created_at = cursor.created_at
     *   AND id < cursor.id
     * )
     */
    query =
      query.or(
        [
          `created_at.lt.${decodedCursor.created_at}`,
          `and(created_at.eq.${decodedCursor.created_at},id.lt.${decodedCursor.id})`,
        ].join(",")
      );
  }

  const {
    data,
    error,
  } =
    await query
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      )
      .order(
        "id",
        {
          ascending:
            false,
        }
      )
      .limit(
        pageSize + 1
      );

  if (error) {
    throw createWalletReadError({
      message:
        "Không thể đọc lịch sử Cing Wallet",
      code:
        "CING_WALLET_HISTORY_READ_FAILED",
      statusCode:
        500,
    });
  }

  const rows =
    Array.isArray(
      data
    )
      ? data
      : [];

  const hasMore =
    rows.length >
    pageSize;

  const pageRows =
    hasMore
      ? rows.slice(
          0,
          pageSize
        )
      : rows;

  const transactions =
    pageRows.map(
      normalizeWalletTransaction
    );

  const lastRow =
    pageRows[
      pageRows.length - 1
    ];

  return {
    transactions,

    pagination: {
      limit:
        pageSize,

      has_more:
        hasMore,

      next_cursor:
        hasMore
          ? encodeCursor(
              lastRow
            )
          : null,
    },
  };
}


async function getWalletOverview({
  customer,
  historyLimit,
}) {
  const userId =
    resolveWalletReadUserId(
      customer
    );

  await assertCanonicalWalletPlayer(
    userId
  );

  const [
    account,
    history,
  ] =
    await Promise.all([
      readWalletAccountByUserId(
        userId
      ),

      readWalletTransactionsByUserId({
        userId,
        limit:
          historyLimit,
        cursor:
          null,
      }),
    ]);

  return {
    account,
    ...history,
  };
}


async function getWalletTransactions({
  customer,
  limit,
  cursor,
}) {
  const userId =
    resolveWalletReadUserId(
      customer
    );

  await assertCanonicalWalletPlayer(
    userId
  );

  return readWalletTransactionsByUserId({
    userId,
    limit,
    cursor,
  });
}


module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  resolveWalletReadUserId,
  normalizePageSize,
  encodeCursor,
  decodeCursor,
  getWalletOverview,
  getWalletTransactions,
};

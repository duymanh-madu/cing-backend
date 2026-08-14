const jwt =
  require(
    "jsonwebtoken"
  );

const customerRepository =
  require(
    "../../../../repositories/customer/customerRepository"
  );

const {
  assertAccessToken,
} = require(
  "../domain/cingArtilleryRealtimeContracts"
);

function buildError({
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

function extractHandshakeAccessToken(
  socket
) {
  const authToken =
    socket?.handshake?.auth?.token;

  if (authToken) {
    return assertAccessToken(
      authToken
    );
  }

  const authorization =
    String(
      socket?.handshake?.headers
        ?.authorization || ""
    ).trim();

  if (
    authorization.startsWith(
      "Bearer "
    )
  ) {
    return assertAccessToken(
      authorization.slice(
        "Bearer ".length
      )
    );
  }

  throw buildError({
    message:
      "Thiếu access token Cing Artillery realtime",

    code:
      "CING_ARTILLERY_REALTIME_UNAUTHORIZED",

    statusCode:
      401,
  });
}

async function authenticateSocket(
  socket
) {
  const token =
    extractHandshakeAccessToken(
      socket
    );

  let payload;

  try {
    payload =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );
  } catch (_error) {
    throw buildError({
      message:
        "Access token Cing Artillery realtime không hợp lệ",

      code:
        "CING_ARTILLERY_REALTIME_INVALID_TOKEN",

      statusCode:
        401,
    });
  }

  const customerId =
    String(
      payload?.customerId || ""
    ).trim();

  if (!customerId) {
    throw buildError({
      message:
        "Access token Cing Artillery realtime thiếu customer identity",

      code:
        "CING_ARTILLERY_REALTIME_INVALID_TOKEN",

      statusCode:
        401,
    });
  }

  const customer =
    await customerRepository
      .findById(
        customerId
      );

  if (!customer?.id) {
    throw buildError({
      message:
        "Không tìm thấy customer của Cing Artillery realtime",

      code:
        "CING_ARTILLERY_REALTIME_CUSTOMER_NOT_FOUND",

      statusCode:
        401,
    });
  }

  return {
    userId:
      String(
        customer.id
      ),
  };
}

module.exports = {
  authenticateSocket,
};

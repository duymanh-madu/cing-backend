const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const express = require("express");

const AppError = require("../../../utils/AppError");

const originalLoad = Module._load;

let refreshImplementation = null;
let otherRouteCalls = 0;

const mockController = {
  refreshSession(req, res, next) {
    return refreshImplementation(req, res, next);
  },

  loginWithZalo(req, res) {
    otherRouteCalls += 1;
    return res.status(204).end();
  },

  openCachedMemberApp(req, res) {
    otherRouteCalls += 1;
    return res.status(204).end();
  },

  recoverDeviceReauth(req, res) {
    otherRouteCalls += 1;
    return res.status(204).end();
  },

  getSession(req, res) {
    otherRouteCalls += 1;
    return res.status(204).end();
  },

  openSession(req, res) {
    otherRouteCalls += 1;
    return res.status(204).end();
  },

  registerDeviceReauth(req, res) {
    otherRouteCalls += 1;
    return res.status(204).end();
  },

  logout(req, res) {
    otherRouteCalls += 1;
    return res.status(204).end();
  },
};

let authRouter;

try {
  Module._load = function patchedLoad(request, parent, isMain) {
    if (
      parent?.filename?.endsWith("/routes/authRoutes.js") &&
      request === "../controllers/auth/authController"
    ) {
      return mockController;
    }

    if (
      parent?.filename?.endsWith("/routes/authRoutes.js") &&
      request === "../middlewares/authMiddleware"
    ) {
      return (req, res, next) => next();
    }

    return originalLoad.apply(this, arguments);
  };

  authRouter = require("../../../routes/authRoutes");
} finally {
  Module._load = originalLoad;
}

async function requestWith(handler, path = "/auth/refresh") {
  refreshImplementation = handler;

  const app = express();

  app.use(express.json());

  app.use("/auth", authRouter);

  app.use((error, req, res, next) => {
    return res.status(500).json({
      success: false,
      code: "UNEXPECTED_ERROR",
    });
  });

  const server = app.listen(0, "127.0.0.1");

  try {
    await new Promise((resolve, reject) => {
      if (server.listening) return resolve();
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const address = server.address();

    const response = await fetch(
      `http://127.0.0.1:${address.port}${path}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          refreshToken: "synthetic-test-token",
        }),
      }
    );

    const body =
      response.status === 204
        ? null
        : await response.json();

    return {
      status: response.status,
      body,
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => {
        if (error) return reject(error);
        resolve();
      });
    });
  }
}

function rejectWithAppError(statusCode, code) {
  return async (req, res, next) => {
    next(new AppError({
      statusCode,
      code,
      message: "Synthetic auth failure",
    }));
  };
}

test("refresh success preserves HTTP 200 contract", async () => {
  const result = await requestWith((req, res) => {
    return res.json({
      success: true,
      data: {
        accessToken: "synthetic-access-token",
        customer: {
          id: "synthetic-customer",
        },
      },
    });
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(
    result.body.data.accessToken,
    "synthetic-access-token"
  );
});

for (const [code, statusCode] of [
  ["INVALID_REFRESH_TOKEN", 401],
  ["REFRESH_CUSTOMER_NOT_FOUND", 401],
  ["AUTH_CUSTOMER_LOOKUP_UNAVAILABLE", 503],
  ["AUTH_REFRESH_UNAVAILABLE", 503],
]) {
  test(`${code} returns HTTP ${statusCode}`, async () => {
    const result = await requestWith(
      rejectWithAppError(statusCode, code)
    );

    assert.equal(result.status, statusCode);
    assert.equal(result.body.success, false);
    assert.equal(result.body.code, code);
    assert.equal(
      result.body.message,
      "Synthetic auth failure"
    );
  });
}

test("unexpected refresh errors remain HTTP 500", async () => {
  const result = await requestWith(
    async (req, res, next) => {
      next(new Error("Synthetic unexpected failure"));
    }
  );

  assert.equal(result.status, 500);
  assert.equal(
    result.body.code,
    "UNEXPECTED_ERROR"
  );
});

test("refresh boundary does not affect other auth routes", async () => {
  const before = otherRouteCalls;

  const result = await requestWith(
    () => {
      throw new Error(
        "Refresh handler must not run for another route"
      );
    },
    "/auth/zalo/login"
  );

  assert.equal(result.status, 204);
  assert.equal(otherRouteCalls, before + 1);
});

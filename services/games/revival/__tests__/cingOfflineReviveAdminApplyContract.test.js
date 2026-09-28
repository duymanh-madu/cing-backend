"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  prepareRevivalAdminApply,
} = require(
  "../cingOfflineReviveAdminApplyContract"
);

const REQUEST_ID =
  "84a1d2e3-f456-4789-a123-456789abcdef";

function validInput(
  overrides = {}
) {
  return {
    admin: {
      id: 42,
      role: "super_admin",
    },

    applyRequestId:
      REQUEST_ID,

    challenges: [
      {
        game_key:
          "black-pearl-rush",
        enabled: true,
        challenge_type:
          "combo",
        target_value: 50,
        reward_points: 29,
      },
      {
        game_key:
          "chess",
        enabled: true,
        challenge_type:
          "wins",
        target_value: 3,
        reward_points: 50,
      },
    ],

    ...overrides,
  };
}

function reject(
  overrides,
  code,
  statusCode
) {
  assert.throws(
    () =>
      prepareRevivalAdminApply(
        validInput(
          overrides
        )
      ),
    error =>
      error.code === code &&
      error.statusCode ===
        statusCode
  );
}

test(
  "verified Super Admin produces RPC input",
  () => {
    const result =
      prepareRevivalAdminApply(
        validInput()
      );

    assert.equal(
      result.actor_admin_id,
      "42"
    );

    assert.equal(
      result.apply_request_id,
      REQUEST_ID
    );

    assert.equal(
      result.revival_challenges.length,
      2
    );

    assert.equal(
      result.revival_challenges[0]
        .target_value,
      50
    );

    assert.equal(
      result.revival_challenges[1]
        .enabled,
      false
    );
  }
);

test(
  "same request ID remains stable on retry",
  () => {
    const first =
      prepareRevivalAdminApply(
        validInput()
      );

    const retry =
      prepareRevivalAdminApply(
        validInput()
      );

    assert.deepEqual(
      first,
      retry
    );
  }
);

test(
  "request ID normalizes uppercase UUID",
  () => {
    const result =
      prepareRevivalAdminApply(
        validInput({
          applyRequestId:
            REQUEST_ID.toUpperCase(),
        })
      );

    assert.equal(
      result.apply_request_id,
      REQUEST_ID
    );
  }
);

test(
  "missing Admin is rejected",
  () => {
    reject(
      {
        admin: undefined,
      },
      "REVIVAL_APPLY_SUPER_ADMIN_REQUIRED",
      403
    );
  }
);

for (const role of [
  "manager",
  "cashier",
  "marketing",
]) {
  test(
    `${role} cannot apply Revival config`,
    () => {
      reject(
        {
          admin: {
            id: 42,
            role,
          },
        },
        "REVIVAL_APPLY_SUPER_ADMIN_REQUIRED",
        403
      );
    }
  );
}

test(
  "missing authenticated Admin ID is rejected",
  () => {
    reject(
      {
        admin: {
          role:
            "super_admin",
        },
      },
      "REVIVAL_APPLY_ACTOR_REQUIRED",
      403
    );
  }
);

for (const requestId of [
  undefined,
  "",
  "not-a-uuid",
  "123456",
]) {
  test(
    `invalid request identity is rejected: ${String(requestId)}`,
    () => {
      reject(
        {
          applyRequestId:
            requestId,
        },
        "REVIVAL_APPLY_REQUEST_ID_INVALID",
        400
      );
    }
  );
}

test(
  "invalid reward is rejected before DB access",
  () => {
    reject(
      {
        challenges: [
          {
            game_key:
              "black-pearl-rush",
            enabled: true,
            challenge_type:
              "combo",
            target_value: 50,
            reward_points: 0,
          },
        ],
      },
      "REVIVAL_ADMIN_REWARD_INVALID",
      400
    );
  }
);

test(
  "duplicate Revival game is rejected",
  () => {
    const challenge = {
      game_key:
        "black-pearl-rush",
      enabled: true,
      challenge_type:
        "combo",
      target_value: 50,
      reward_points: 29,
    };

    reject(
      {
        challenges: [
          challenge,
          {
            ...challenge,
          },
        ],
      },
      "REVIVAL_ADMIN_DUPLICATE_GAME",
      400
    );
  }
);

test(
  "actor cannot be supplied as arbitrary request field",
  () => {
    const input =
      validInput();

    input.actor_admin_id =
      "forged-admin";

    input.role =
      "super_admin";

    const result =
      prepareRevivalAdminApply(
        input
      );

    assert.equal(
      result.actor_admin_id,
      "42"
    );

    assert.equal(
      Object.hasOwn(
        result,
        "role"
      ),
      false
    );
  }
);

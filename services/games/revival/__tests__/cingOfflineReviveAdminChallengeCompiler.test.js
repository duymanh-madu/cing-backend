"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REVIVAL_GAME_KEYS,
  compileRevivalAdminChallenges,
} = require(
  "../cingOfflineReviveAdminChallengeCompiler"
);

function pearl(overrides = {}) {
  return {
    game_key: "black-pearl-rush",
    enabled: true,
    challenge_type: "combo",
    target_value: 50,
    reward_points: 29,
    ...overrides,
  };
}

function tower(overrides = {}) {
  return {
    game_key: "cing-stack-tower",
    enabled: true,
    challenge_type: "score",
    target_value: 150,
    reward_points: 40,
    ...overrides,
  };
}

function rejects(
  challenges,
  code
) {
  assert.throws(
    () =>
      compileRevivalAdminChallenges(
        challenges
      ),
    error =>
      error.code === code &&
      error.statusCode === 400
  );
}

test(
  "compiler owns exactly two Revival games",
  () => {
    assert.deepEqual(
      REVIVAL_GAME_KEYS,
      [
        "black-pearl-rush",
        "cing-stack-tower",
      ]
    );
  }
);

test(
  "valid two-game config is preserved",
  () => {
    assert.deepEqual(
      compileRevivalAdminChallenges([
        pearl(),
        tower(),
      ]),
      [
        {
          game_key: "black-pearl-rush",
          enabled: true,
          challenge_type: "combo",
          target_value: 50,
          reward_points: 29,
        },
        {
          game_key: "cing-stack-tower",
          enabled: true,
          challenge_type: "score",
          target_value: 150,
          reward_points: 40,
        },
      ]
    );
  }
);

test(
  "unrelated Chess config is not mutated",
  () => {
    const chess = {
      game_key: "chess",
      enabled: true,
      challenge_type: "wins",
      target_value: 3,
      reward_points: 100,
    };

    const source = [
      chess,
      pearl(),
    ];

    const result =
      compileRevivalAdminChallenges(
        source
      );

    assert.equal(
      source[0],
      chess
    );

    assert.equal(
      result.length,
      2
    );

    assert.equal(
      result[0].enabled,
      true
    );

    assert.equal(
      result[1].enabled,
      false
    );
  }
);

test(
  "removed Revival game becomes disabled",
  () => {
    const result =
      compileRevivalAdminChallenges([
        pearl(),
      ]);

    assert.deepEqual(
      result[1],
      {
        game_key: "cing-stack-tower",
        enabled: false,
        challenge_type: null,
        target_value: null,
        reward_points: null,
      }
    );
  }
);

test(
  "empty Admin list disables both games",
  () => {
    const result =
      compileRevivalAdminChallenges(
        []
      );

    assert.equal(
      result.length,
      2
    );

    assert.ok(
      result.every(
        entry =>
          entry.enabled === false
      )
    );
  }
);

test(
  "explicit disable does not invent reward",
  () => {
    const result =
      compileRevivalAdminChallenges([
        pearl({
          enabled: false,
        }),
      ]);

    assert.deepEqual(
      result[0],
      {
        game_key: "black-pearl-rush",
        enabled: false,
        challenge_type: null,
        target_value: null,
        reward_points: null,
      }
    );
  }
);

test(
  "duplicate game is rejected",
  () => {
    rejects(
      [
        pearl(),
        pearl({
          target_value: 80,
        }),
      ],
      "REVIVAL_ADMIN_DUPLICATE_GAME"
    );
  }
);

test(
  "duplicate disabled game is rejected",
  () => {
    rejects(
      [
        pearl({
          enabled: false,
        }),
        pearl(),
      ],
      "REVIVAL_ADMIN_DUPLICATE_GAME"
    );
  }
);

test(
  "missing explicit enabled is rejected",
  () => {
    const item = pearl();
    delete item.enabled;

    rejects(
      [item],
      "REVIVAL_ADMIN_ENABLED_REQUIRED"
    );
  }
);

test(
  "unsupported Revival challenge type is rejected",
  () => {
    rejects(
      [
        pearl({
          challenge_type: "wins",
        }),
      ],
      "REVIVAL_ADMIN_CHALLENGE_TYPE_INVALID"
    );
  }
);

for (const target of [
  0,
  -1,
  1.5,
  "50",
  NaN,
  Infinity,
  1000001,
]) {
  test(
    `invalid target rejected: ${String(target)}`,
    () => {
      rejects(
        [
          pearl({
            target_value: target,
          }),
        ],
        "REVIVAL_ADMIN_TARGET_INVALID"
      );
    }
  );
}

for (const reward of [
  0,
  -1,
  1.5,
  "29",
  NaN,
  Infinity,
  1000001,
]) {
  test(
    `invalid reward rejected: ${String(reward)}`,
    () => {
      rejects(
        [
          pearl({
            reward_points: reward,
          }),
        ],
        "REVIVAL_ADMIN_REWARD_INVALID"
      );
    }
  );
}

test(
  "non-array input is rejected",
  () => {
    rejects(
      null,
      "REVIVAL_ADMIN_CHALLENGES_ARRAY_REQUIRED"
    );
  }
);

test(
  "malformed row is rejected",
  () => {
    rejects(
      [null],
      "REVIVAL_ADMIN_CHALLENGE_INVALID"
    );
  }
);

test(
  "compiler never mutates input",
  () => {
    const input = Object.freeze([
      Object.freeze(
        pearl()
      ),
    ]);

    compileRevivalAdminChallenges(
      input
    );

    assert.equal(
      input[0].target_value,
      50
    );
  }
);

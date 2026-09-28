"use strict";

const test = require("node:test");

const assert =
  require("node:assert/strict");

const {
  completeDailyMissionReviveV2,
  projectDailyMissionReviveResult,
} = require(
  "../cingDailyMissionReviveV2Service"
);

const missionId =
  "10000000-0000-4000-8000-000000000001";

const input = {
  user_id: "fixture-player",

  mission_date: "2026-09-24",

  mission_type: "checkin",

  revive_credits: 4,

  points: 6,

  label: "Điểm danh",
};

function row(overrides = {}) {
  return {
    applied: true,

    mission_id: missionId,

    revive_credits_awarded: 4,

    points_awarded: 6,

    revive_credit_balance_after: 9,

    total_points_after: 56,

    ...overrides,
  };
}

test(
  "V2 calls exact PostgreSQL RPC",
  async () => {
    const calls = [];

    const client = {
      async rpc(name, args) {
        calls.push({
          name,
          args,
        });

        return {
          data: [row()],
          error: null,
        };
      },
    };

    const result =
      await completeDailyMissionReviveV2(
        input,
        client
      );

    assert.deepEqual(
      calls,
      [
        {
          name:
            "complete_daily_mission_revive_v2",

          args: {
            p_user_id:
              "fixture-player",

            p_mission_date:
              "2026-09-24",

            p_mission_type:
              "checkin",

            p_revive_credits:
              4,

            p_points:
              6,

            p_mission_label:
              "Điểm danh",
          },
        },
      ]
    );

    assert.deepEqual(
      result,
      row()
    );
  }
);

test(
  "V2 preserves Credit and points as distinct fields",
  () => {
    assert.deepEqual(
      projectDailyMissionReviveResult(
        row({
          revive_credits_awarded: 3,

          points_awarded: 7,

          revive_credit_balance_after: 18,

          total_points_after: 90,
        })
      ),

      row({
        revive_credits_awarded: 3,

        points_awarded: 7,

        revive_credit_balance_after: 18,

        total_points_after: 90,
      })
    );
  }
);

test(
  "V1 historical mission replay awards zero V2 credits",
  () => {
    const result =
      projectDailyMissionReviveResult(
        row({
          applied: false,

          revive_credits_awarded: 0,

          points_awarded: 3,

          revive_credit_balance_after: 0,

          total_points_after: 43,
        })
      );

    assert.equal(
      result.applied,
      false
    );

    assert.equal(
      result.revive_credits_awarded,
      0
    );

    assert.equal(
      result.points_awarded,
      3
    );
  }
);

test(
  "V2 completed mission replay remains unapplied",
  () => {
    const result =
      projectDailyMissionReviveResult(
        row({
          applied: false,
        })
      );

    assert.equal(
      result.applied,
      false
    );

    assert.equal(
      result.revive_credits_awarded,
      4
    );
  }
);

test(
  "rejects invalid input before RPC",
  async () => {
    let calls = 0;

    const client = {
      async rpc() {
        calls += 1;

        throw new Error(
          "RPC_MUST_NOT_BE_CALLED"
        );
      },
    };

    const invalid = [
      {
        ...input,
        user_id: "",
      },

      {
        ...input,
        revive_credits: -1,
      },

      {
        ...input,
        revive_credits: 0,
        points: 0,
      },

      {
        ...input,
        points: 1.5,
      },

      {
        ...input,
        revive_credits: 2147483648,
      },

      {
        ...input,
        label: "",
      },
    ];

    for (const args of invalid) {
      await assert.rejects(
        completeDailyMissionReviveV2(
          args,
          client
        ),
        /DAILY_MISSION_REVIVE_/
      );
    }

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "rejects incomplete or corrupt RPC result",
  () => {
    const invalid = [
      null,

      [],

      row({
        applied: "true",
      }),

      row({
        mission_id: null,
      }),

      row({
        revive_credits_awarded:
          undefined,
      }),

      row({
        revive_credit_balance_after:
          -1,
      }),

      row({
        total_points_after:
          2147483648,
      }),
    ];

    for (const value of invalid) {
      assert.throws(
        () =>
          projectDailyMissionReviveResult(
            value
          ),
        /DAILY_MISSION_REVIVE_/
      );
    }
  }
);

test(
  "database failure is not treated as success",
  async () => {
    await assert.rejects(
      completeDailyMissionReviveV2(
        input,
        {
          async rpc() {
            return {
              data: null,

              error: {
                code: "23505",

                message:
                  "REVIVE_REFERENCE_CONFLICT",
              },
            };
          },
        }
      ),

      (error) => {
        assert.equal(
          error.message,
          "DAILY_MISSION_REVIVE_AUTHORITY_FAILED"
        );

        assert.equal(
          error.code,
          "23505"
        );

        return true;
      }
    );
  }
);

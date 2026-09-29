"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../../../..");

const serviceSource = fs.readFileSync(
  path.join(root, "services/dailyMissionService.js"),
  "utf8"
);

const presentation = require(
  "../cingDailyMissionReviveV2Presentation"
);

const missionId =
  "10000000-0000-4000-8000-000000000001";

function v1Row(overrides = {}) {
  return {
    applied: true,
    mission_id: missionId,
    plays_awarded: 4,
    points_awarded: 6,
    game_plays_after: 14,
    total_points_after: 56,
    ...overrides,
  };
}

function v2Row(overrides = {}) {
  return {
    applied: true,
    mission_id: missionId,
    revive_credits_awarded: 4,
    points_awarded: 6,
    revive_credit_balance_after: 14,
    total_points_after: 56,
    ...overrides,
  };
}

function createHarness({
  flag,
  v1 = v1Row(),
  v2 = v2Row(),
  v2Error = null,
  configs = [
    {
      type: "checkin",
      label: "Điểm danh",
      plays: 4,
      points: 6,
      condition_type: "manual",
      condition_value: 1,
    },
    {
      type: "order_100",
      label: "Đơn hàng",
      plays: 4,
      points: 6,
      condition_type: "order_amount",
      condition_value: 100,
    },
    {
      type: "win",
      label: "Thắng cờ",
      plays: 4,
      points: 6,
      condition_type: "manual",
      condition_value: 5,
    },
  ],
  completed = [],
} = {}) {
  const calls = [];
  const events = [];

  const supabase = {
    rpc: async (name, args) => {
      calls.push({ name, args });

      if (name === "complete_daily_mission_atomic") {
        return {
          data: [v1],
          error: null,
        };
      }

      throw new Error(`UNEXPECTED_RPC:${name}`);
    },

    from(table) {
      if (table === "mission_configs") {
        return {
          select() {
            return {
              eq() {
                return {
                  async order() {
                    return {
                      data: configs,
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "daily_missions") {
        return {
          select() {
            return {
              eq() {
                return {
                  async eq() {
                    return {
                      data: completed,
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`UNEXPECTED_TABLE:${table}`);
    },
  };

  const adapter = {
    async completeDailyMissionReviveV2(args) {
      calls.push({
        name: "complete_daily_mission_revive_v2",
        args,
      });

      if (v2Error) {
        throw v2Error;
      }

      return { ...v2 };
    },
  };

  const moduleObject = {
    exports: {},
  };

  const fakeEnv = {};

  if (flag !== undefined) {
    fakeEnv.CING_DAILY_MISSION_REVIVE_V2_ENABLED =
      flag;
  }

  const requireStub = (request) => {
    switch (request) {
      case "../supabase":
        return supabase;

      case "./realtime/realtimeEventBus":
        return {
          realtimeEventBus: {
            publish(event) {
              events.push(event);
            },
          },
        };

      case "./games/revival/cingDailyMissionReviveV2Service":
        return adapter;

      case "./games/revival/cingDailyMissionReviveV2Presentation":
        return presentation;

      default:
        throw new Error(
          `UNEXPECTED_REQUIRE:${request}`
        );
    }
  };

  const sandbox = {
    require: requireStub,
    module: moduleObject,
    exports: moduleObject.exports,
    process: {
      env: fakeEnv,
    },
    Date,
    Number,
    Error,
    console,
  };

  vm.runInNewContext(
    serviceSource,
    sandbox,
    {
      filename: "dailyMissionService.js",
      timeout: 1000,
    }
  );

  return {
    service: moduleObject.exports,
    calls,
    events,
  };
}

test(
  "missing legacy flag still uses Revive V2",
  async () => {
    const h = createHarness();

    const result =
      await h.service.doCheckin("user-1");

    assert.equal(
      h.calls.length,
      1
    );

    assert.equal(
      h.calls[0].name,
      "complete_daily_mission_revive_v2"
    );

    assert.equal(
      h.calls[0].args.revive_credits,
      4
    );

    assert.equal(
      result.revive_credits_awarded,
      4
    );

    assert.equal(
      result.revive_credit_balance_after,
      14
    );

    assert.equal(
      result.points_awarded,
      6
    );

    assert.match(
      result.message,
      /\+4 Revive Credit/
    );

    assert.equal(
      "plays_awarded" in result,
      false
    );

    assert.equal(
      "game_plays_after" in result,
      false
    );

    assert.equal(
      h.events.length,
      1
    );

    assert.equal(
      h.events[0].payload.revive_credits_awarded,
      4
    );
  }
);

test(
  "legacy flag values are ignored and Revive V2 remains authoritative",
  async () => {
    for (const flag of [
      "false",
      "TRUE",
      "1",
      "",
    ]) {
      const h = createHarness({ flag });

      const result =
        await h.service.doCheckin(
          "user-1"
        );

      assert.deepEqual(
        h.calls.map((call) => call.name),
        ["complete_daily_mission_revive_v2"]
      );

      assert.equal(
        result.revive_credits_awarded,
        4
      );

      assert.equal(
        "plays_awarded" in result,
        false
      );
    }
  }
);

test(
  "active check-in uses V2 and Credit message",
  async () => {
    const h = createHarness();

    const result =
      await h.service.doCheckin("user-1");

    assert.equal(
      h.calls.length,
      1
    );

    assert.equal(
      h.calls[0].name,
      "complete_daily_mission_revive_v2"
    );

    assert.equal(
      h.calls[0].args.revive_credits,
      4
    );

    assert.equal(
      result.revive_credits_awarded,
      4
    );

    assert.equal(
      result.revive_credit_balance_after,
      14
    );

    assert.equal(
      result.points_awarded,
      6
    );

    assert.match(
      result.message,
      /\+4 Revive Credit/
    );

    assert.equal(
      "plays_awarded" in result,
      false
    );

    assert.equal(
      "game_plays_after" in result,
      false
    );
  }
);

test(
  "V2 realtime sends Credit, not plays",
  async () => {
    const h = createHarness({
      flag: "true",
    });

    await h.service.doCheckin(
      "user-1"
    );

    assert.equal(
      h.events.length,
      1
    );

    const event = h.events[0];

    assert.equal(
      event.event,
      "mission.completed"
    );

    assert.equal(
      event.payload.revive_credits_awarded,
      4
    );

    assert.equal(
      event.payload.revive_credit_balance_after,
      14
    );

    assert.equal(
      "plays_awarded" in event.payload,
      false
    );

    assert.equal(
      "game_plays_after" in event.payload,
      false
    );
  }
);

test(
  "V2 replay does not grant or notify twice",
  async () => {
    const h = createHarness({
      flag: "true",
      v2: v2Row({
        applied: false,
      }),
    });

    const result =
      await h.service.doCheckin(
        "user-1"
      );

    assert.equal(
      result.already_checked_in,
      true
    );

    assert.equal(
      result.revive_credits_awarded,
      0
    );

    assert.equal(
      result.points_awarded,
      0
    );

    assert.equal(
      h.events.length,
      0
    );
  }
);

test(
  "V2 RPC failure never falls back to V1",
  async () => {
    const h = createHarness({
      flag: "true",
      v2Error: new Error(
        "V2_AUTHORITY_FAILED"
      ),
    });

    await assert.rejects(
      h.service.doCheckin(
        "user-1"
      ),
      /V2_AUTHORITY_FAILED/
    );

    assert.deepEqual(
      h.calls.map((call) => call.name),
      ["complete_daily_mission_revive_v2"]
    );

    assert.equal(
      h.events.length,
      0
    );
  }
);

test(
  "V2 order mission preserves both assets",
  async () => {
    const h = createHarness({
      flag: "true",
    });

    const result =
      await h.service.checkOrderMissions(
        "user-1",
        200
      );

    assert.equal(
      result.length,
      1
    );

    assert.equal(
      result[0].type,
      "order_100"
    );

    assert.equal(
      result[0].revive_credits_awarded,
      4
    );

    assert.equal(
      result[0].points_awarded,
      6
    );

    assert.equal(
      "plays" in result[0],
      false
    );

    assert.equal(
      h.events.length,
      1
    );
  }
);

test(
  "V2 order replay is excluded",
  async () => {
    const h = createHarness({
      flag: "true",
      v2: v2Row({
        applied: false,
      }),
    });

    const result =
      await h.service.checkOrderMissions(
        "user-1",
        200
      );

    assert.equal(
      result.length,
      0
    );

    assert.equal(
      h.events.length,
      0
    );
  }
);

test(
  "V2 manual mission uses shared authority",
  async () => {
    const h = createHarness({
      flag: "true",
    });

    const result =
      await h.service.completeManualMission({
        user_id: "user-1",
        mission_type: "win",
        config: {
          label: "Thắng cờ",
          plays: 4,
          points: 6,
        },
      });

    assert.equal(
      result.applied,
      true
    );

    assert.equal(
      result.revive_credits_awarded,
      4
    );

    assert.equal(
      h.calls.length,
      1
    );

    assert.equal(
      h.calls[0].name,
      "complete_daily_mission_revive_v2"
    );

    assert.equal(
      h.events.length,
      1
    );
  }
);

test(
  "mission list retains historical V1 identity",
  async () => {
    const h = createHarness({
      flag: "true",
      completed: [
        {
          mission_type: "checkin",
          completed: true,
          completed_at:
            "2026-09-24T00:00:00Z",
          plays_awarded: 3,
          points_awarded: 2,
          reward_snapshot: {
            plays: 3,
            points: 2,
          },
        },
      ],
    });

    const list =
      await h.service.getDailyMissions(
        "user-1"
      );

    const checkin =
      list.find(
        (item) =>
          item.type === "checkin"
      );

    assert.equal(
      checkin.reward_currency,
      "legacy_game_play"
    );

    assert.equal(
      checkin.revive_credits_awarded,
      0
    );

    assert.equal(
      checkin.plays_awarded,
      3
    );
  }
);

test(
  "mission list identifies completed V2 Credit",
  async () => {
    const h = createHarness({
      flag: "true",
      completed: [
        {
          mission_type: "checkin",
          completed: true,
          plays_awarded: 0,
          points_awarded: 6,
          reward_snapshot: {
            reward_version: 2,
            reward_currency:
              "revive_credit",
            revive_credits: 4,
            plays: 0,
            points: 6,
          },
        },
      ],
    });

    const list =
      await h.service.getDailyMissions(
        "user-1"
      );

    const checkin =
      list.find(
        (item) =>
          item.type === "checkin"
      );

    assert.equal(
      checkin.reward_currency,
      "revive_credit"
    );

    assert.equal(
      checkin.revive_credits_awarded,
      4
    );

    assert.equal(
      checkin.plays_awarded,
      0
    );
  }
);

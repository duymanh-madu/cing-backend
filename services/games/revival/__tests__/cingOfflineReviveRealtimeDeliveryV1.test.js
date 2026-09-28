"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");

const ROOT = path.resolve(__dirname, "../../../..");

const logger = {
  info() {},
  warn() {},
  error() {},
};

function load(relativePath, dependencies) {
  const filename = path.join(ROOT, relativePath);

  const module = {
    exports: {},
  };

  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module,
      exports: module.exports,
      console,
      require(request) {
        if (!Object.prototype.hasOwnProperty.call(
          dependencies,
          request
        )) {
          throw new Error(
            `Unexpected dependency: ${request}`
          );
        }

        return dependencies[request];
      },
    },
    { filename }
  );

  return module.exports;
}

function dispatcher() {
  return load(
    "services/realtime/realtimeDispatcherService.js",
    {
      "../loggerService": logger,
    }
  ).dispatchRealtimeEvent;
}

function bus(io) {
  const result = load(
    "services/realtime/realtimeEventBus.js",
    {
      events: EventEmitter,

      "./realtimeDispatcherService": {
        dispatchRealtimeEvent: dispatcher(),
      },

      "./realtimeMetricsService": {
        trackRealtimePublished() {},
      },

      "./realtimeEventValidator": {
        validateRealtimeEvent({
          event,
          payload,
        }) {
          if (!event || !payload) {
            throw new Error("Invalid realtime event");
          }
        },
      },

      "../loggerService": logger,
    }
  ).realtimeEventBus;

  if (io) {
    result.setIO(io);
  }

  return result;
}

const payload = {
  type: "game",
  game_key: "cing-stack-tower",
  scope: "weekly",
  reason: "highscore_changed",
  updated_user: {
    user_id: "member-1",
    player_name: "Cing iu",
    avatar: "",
  },
  previous_best: 200,
  score: 500,
  highscore_changed: true,
  leaderboard: [
    {
      user_id: "member-1",
      rank: 1,
      score: 500,
    },
  ],
};

const event = {
  event: "leaderboard.updated",
  delivery_type: "BROADCAST",
  room: "room:leaderboard:global",
  payload,
};

test(
  "dispatcher rejects missing IO",
  () => {
    assert.equal(
      dispatcher()({
        io: null,
        realtimeEvent: event,
      }),
      false
    );
  }
);

test(
  "dispatcher returns true after emit",
  () => {
    const emitted = [];

    const result = dispatcher()({
      io: {
        emit(name, data) {
          emitted.push([name, data]);
        },
      },
      realtimeEvent: event,
    });

    assert.equal(result, true);
    assert.equal(emitted.length, 1);
    assert.equal(
      emitted[0][0],
      "leaderboard.updated"
    );
    assert.equal(emitted[0][1], payload);
  }
);

test(
  "dispatcher returns false when emit throws",
  () => {
    assert.equal(
      dispatcher()({
        io: {
          emit() {
            throw new Error("socket failure");
          },
        },
        realtimeEvent: event,
      }),
      false
    );
  }
);

test(
  "bus rejects missing IO",
  () => {
    const realtimeBus = bus(null);
    let internal = 0;

    realtimeBus.on(
      "leaderboard.updated",
      () => internal++
    );

    assert.equal(
      realtimeBus.publish(event),
      false
    );

    assert.equal(internal, 0);
  }
);

test(
  "bus rejects failed dispatch without internal event",
  () => {
    const realtimeBus = bus({
      emit() {
        throw new Error("socket failure");
      },
    });

    let internal = 0;

    realtimeBus.on(
      "leaderboard.updated",
      () => internal++
    );

    assert.equal(
      realtimeBus.publish(event),
      false
    );

    assert.equal(internal, 0);
  }
);

test(
  "bus emits internal event after successful dispatch",
  () => {
    const emitted = [];

    const realtimeBus = bus({
      emit(name, data) {
        emitted.push([name, data]);
      },
    });

    let internal = 0;

    realtimeBus.on(
      "leaderboard.updated",
      () => internal++
    );

    assert.equal(
      realtimeBus.publish(event),
      true
    );

    assert.equal(emitted.length, 1);
    assert.equal(internal, 1);
  }
);

test(
  "adapter returns publish boolean and preserves payload",
  async () => {
    const captured = [];
    const results = [true, false];

    const adapter = load(
      "services/gamification/realtime/realtimeLeaderboardService.js",
      {
        "../../realtime/realtimeEventConstants": {
          REALTIME_EVENTS: {
            LEADERBOARD_UPDATED:
              "leaderboard.updated",
          },
        },

        "../../realtime/realtimeEventBus": {
          realtimeEventBus: {
            publish(value) {
              captured.push(value);
              return results.shift();
            },
          },
        },
      }
    );

    const args = {
      leaderboard: payload.leaderboard,
      game_key: payload.game_key,
      scope: payload.scope,
      reason: payload.reason,
      updated_user: payload.updated_user,
      previous_best: payload.previous_best,
      score: payload.score,
      highscore_changed:
        payload.highscore_changed,
    };

    assert.equal(
      await adapter.emitLeaderboardUpdate(args),
      true
    );

    assert.equal(
      await adapter.emitLeaderboardUpdate(args),
      false
    );

    assert.equal(captured.length, 2);

    for (const item of captured) {
      assert.equal(
        item.event,
        "leaderboard.updated"
      );

      assert.equal(
        item.delivery_type,
        "BROADCAST"
      );

      assert.equal(
        item.room,
        "room:leaderboard:global"
      );

      assert.equal(
        item.channel,
        "leaderboard"
      );

      assert.equal(item.payload.type, "game");

      for (const [key, value] of
        Object.entries(args)) {
        assert.equal(
          item.payload[key],
          value
        );
      }

      assert.equal(
        typeof item.timestamp,
        "string"
      );

      assert.equal(
        typeof item.payload.timestamp,
        "string"
      );
    }
  }
);

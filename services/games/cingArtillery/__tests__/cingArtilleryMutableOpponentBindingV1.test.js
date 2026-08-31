"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  deriveMutableOpponentBindingV1,
} = require(
  "../domain/cingArtilleryMutableOpponentBindingV1"
);

function player({
  slot,
  account,
  session,
  x,
  y,
}) {
  return {
    participant_slot:
      slot,
    account_id:
      account,
    gameplay_session_id:
      session,
    position_x:
      x,
    position_y:
      y,
    motion_state:
      "stable",
  };
}

test(
  "mutable opponent binding uses current player-world coordinates",
  () => {
    const result =
      deriveMutableOpponentBindingV1({
        shooter:
          player({
            slot: 1,
            account:
              "11111111-1111-4111-8111-111111111111",
            session:
              "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            x: 140,
            y: 330,
          }),
        opponent:
          player({
            slot: 2,
            account:
              "22222222-2222-4222-8222-222222222222",
            session:
              "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            x: 780,
            y: 410,
          }),
        physicsFixedScale:
          1000,
        playerHitRadiusScaled:
          16000n,
        playerHitCenterOffsetYScaled:
          23000n,
      });

    assert.equal(
      result.shooter_position_x,
      140
    );

    assert.equal(
      result.opponent_position_y,
      410
    );

    assert.equal(
      result.opponent_collider.center_x_scaled,
      780000n
    );

    assert.equal(
      result.opponent_collider.center_y_scaled,
      387000n
    );

    assert.equal(
      result.opponent_slot,
      "player_two"
    );
  }
);

test(
  "mutable opponent binding follows current landing position",
  () => {
    const result =
      deriveMutableOpponentBindingV1({
        shooter:
          player({
            slot: 2,
            account:
              "22222222-2222-4222-8222-222222222222",
            session:
              "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            x: 760,
            y: 405,
          }),
        opponent:
          player({
            slot: 1,
            account:
              "11111111-1111-4111-8111-111111111111",
            session:
              "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            x: 180,
            y: 455,
          }),
        physicsFixedScale:
          1000,
        playerHitRadiusScaled:
          16000n,
        playerHitCenterOffsetYScaled:
          23000n,
      });

    assert.equal(
      result.opponent_position_y,
      455
    );

    assert.equal(
      result.opponent_collider.spawn_y_scaled,
      455000n
    );

    assert.equal(
      result.opponent_collider.center_y_scaled,
      432000n
    );
  }
);

test(
  "mutable opponent binding fails closed while participant is falling",
  () => {
    const shooter =
      player({
        slot: 1,
        account:
          "11111111-1111-4111-8111-111111111111",
        session:
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        x: 140,
        y: 330,
      });

    shooter.motion_state =
      "falling";

    assert.throws(
      () =>
        deriveMutableOpponentBindingV1({
          shooter,
          opponent:
            player({
              slot: 2,
              account:
                "22222222-2222-4222-8222-222222222222",
              session:
                "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              x: 780,
              y: 410,
            }),
          physicsFixedScale:
            1000,
          playerHitRadiusScaled:
            16000n,
          playerHitCenterOffsetYScaled:
            23000n,
        }),
      {
        code:
          "CING_ARTILLERY_MUTABLE_OPPONENT_MOTION_STATE_INVALID_V1",
      }
    );
  }
);

test(
  "mutable opponent binding rejects invalid participant pairing",
  () => {
    assert.throws(
      () =>
        deriveMutableOpponentBindingV1({
          shooter:
            player({
              slot: 1,
              account:
                "11111111-1111-4111-8111-111111111111",
              session:
                "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              x: 140,
              y: 330,
            }),
          opponent:
            player({
              slot: 1,
              account:
                "22222222-2222-4222-8222-222222222222",
              session:
                "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              x: 780,
              y: 410,
            }),
          physicsFixedScale:
            1000,
          playerHitRadiusScaled:
            16000n,
          playerHitCenterOffsetYScaled:
            23000n,
        }),
      {
        code:
          "CING_ARTILLERY_MUTABLE_OPPONENT_SLOT_MISMATCH_V1",
      }
    );
  }
);

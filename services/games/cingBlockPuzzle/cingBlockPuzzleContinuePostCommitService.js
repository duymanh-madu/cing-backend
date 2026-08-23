const redisClient =
  require(
    "../../infrastructure/cache/redisClient"
  );

const {
  realtimeEventBus,
} = require(
  "../../realtime/realtimeEventBus"
);

const {
  wakeCingBlockPuzzleContinueIposSyncWorker,
} = require(
  "./workers/cingBlockPuzzleContinueIposSyncWorker"
);

async function
publishContinuePurchaseCommitted({
  userId,
  balanceAfter,
}) {
  const points =
    Number(
      balanceAfter
    );

  try {
    const digits =
      String(
        userId || ""
      ).replace(
        /\D/g,
        ""
      );

    const p84 =
      digits.startsWith("84")
        ? digits
        : "84" +
          digits.slice(1);

    const p0 =
      digits.startsWith("84")
        ? "0" +
          digits.slice(2)
        : digits;

    await redisClient.del(
      `membership:${p84}`,
      `membership:${p0}`,
      `membership:${digits}`,
      `membership:${userId}`
    );
  } catch {}

  try {
    realtimeEventBus.publish({
      event:
        "user.updated",

      delivery_type:
        "BROADCAST",

      payload: {
        user_id:
          userId,

        phone:
          userId,

        points_changed:
          true,
      },

      channel:
        "user",

      timestamp:
        new Date()
          .toISOString(),
    });

    realtimeEventBus.publish({
      event:
        "membership.points",

      delivery_type:
        "BROADCAST",

      payload: {
        user_id:
          userId,

        phone:
          userId,

        points,

        points_changed:
          true,
      },

      channel:
        "membership",

      timestamp:
        new Date()
          .toISOString(),
    });
  } catch {}

  try {
    wakeCingBlockPuzzleContinueIposSyncWorker();
  } catch {}
}

module.exports = {
  publishContinuePurchaseCommitted,
};

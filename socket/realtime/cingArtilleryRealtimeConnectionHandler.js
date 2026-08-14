const {
  authenticateSocket,
} = require(
  "../../services/games/cingArtillery/services/cingArtilleryRealtimeAuthService"
);

const {
  authorizeMatchJoin,
} = require(
  "../../services/games/cingArtillery/services/cingArtilleryRealtimeService"
);

function serializeError(
  error
) {
  return {
    success:
      false,

    code:
      error?.code ||
      "CING_ARTILLERY_REALTIME_ERROR",

    message:
      error?.message ||
      "Cing Artillery realtime error",
  };
}

function registerCingArtilleryRealtimeConnection({
  socket,
}) {
  socket.on(
    "cing-artillery:match:join",
    async (
      payload,
      acknowledgement
    ) => {
      const respond =
        typeof acknowledgement ===
        "function"
          ? acknowledgement
          : () => {};

      try {
        /*
         * Authentication is scoped to the Cing Artillery
         * event boundary. It is intentionally NOT a
         * global io.use() middleware because the existing
         * Socket.IO server hosts legacy unauthenticated
         * realtime flows.
         */
        const identity =
          await authenticateSocket(
            socket
          );

        const authority =
          await authorizeMatchJoin({
            userId:
              identity.userId,

            payload,
          });

        await socket.join(
          authority.room
        );

        respond({
          success:
            true,

          data: {
            match_id:
              authority.matchId,

            runtime_id:
              authority.runtimeId,

            gameplay_session_id:
              authority.gameplaySessionId,

            player:
              authority.player,
          },
        });
      } catch (error) {
        respond(
          serializeError(
            error
          )
        );
      }
    }
  );
}

module.exports = {
  registerCingArtilleryRealtimeConnection,
};

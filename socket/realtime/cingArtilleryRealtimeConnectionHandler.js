const {
  authenticateSocket,
} = require(
  "../../services/games/cingArtillery/services/cingArtilleryRealtimeAuthService"
);

const {
  authorizeMatchJoin,
  authorizeMatchLeave,
  resolveMatchRealtimeReadiness,
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
  io,
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

        /*
         * Transport metadata only.
         *
         * accountId is server-derived after JWT authentication
         * and durable match-membership authorization.
         * It is never accepted from the client and never used
         * as durable game authority.
         */
        socket.data.cingArtilleryAccountId =
          authority.accountId;

        await socket.join(
          authority.room
        );

        const readiness =
          await resolveMatchRealtimeReadiness({
            io,
            authority,
          });

        const readinessPayload = {
          match_id:
            authority.matchId,

          player_one:
            readiness.playerOneReady,

          player_two:
            readiness.playerTwoReady,

          both:
            readiness.bothReady,
        };

        /*
         * Room-level readiness is server-derived and
         * adapter-aware.
         *
         * Every authorized participant receives the same
         * canonical readiness transition when a participant
         * successfully joins the match room.
         */
        io.to(
          authority.room
        ).emit(
          "cing-artillery:match:readiness",
          readinessPayload
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

            readiness: {
              player_one:
                readiness.playerOneReady,

              player_two:
                readiness.playerTwoReady,

              both:
                readiness.bothReady,
            },
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

  socket.on(
    "cing-artillery:match:leave",
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
         * Explicit leave is transport lifecycle only.
         *
         * It re-authenticates and re-authorizes against
         * durable match membership before leaving the
         * Socket.IO room. It must never terminate or
         * mutate match/runtime/gameplay-session state.
         */
        const identity =
          await authenticateSocket(
            socket
          );

        const authority =
          await authorizeMatchLeave({
            userId:
              identity.userId,

            payload,
          });

        await socket.leave(
          authority.room
        );

        respond({
          success:
            true,

          data: {
            match_id:
              authority.matchId,
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

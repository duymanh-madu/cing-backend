const {
  authenticateSocket,
} = require(
  "../../services/games/cingArtillery/services/cingArtilleryRealtimeAuthService"
);

const {
  acceptRealtimeShotCommand,
  authorizeMatchJoin,
  authorizeMatchLeave,
  resolveMatchCombatStartAuthority,
  resolveMatchRealtimeReadiness,
  resolveMatchReadinessAuthorityByMatchId,
} = require(
  "../../services/games/cingArtillery/services/cingArtilleryRealtimeService"
);

const {
  parseMatchRoomName,
} = require(
  "../../services/games/cingArtillery/domain/cingArtilleryRealtimeContracts"
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

async function broadcastMatchReadiness({
  io,
  authority,
}) {
  const readiness =
    await resolveMatchRealtimeReadiness({
      io,
      authority,
    });

  const payload = {
    match_id:
      authority.matchId,

    player_one:
      readiness.playerOneReady,

    player_two:
      readiness.playerTwoReady,

    both:
      readiness.bothReady,
  };

  io.to(
    authority.room
  ).emit(
    "cing-artillery:match:readiness",
    payload
  );

  return readiness;
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
          await broadcastMatchReadiness({
            io,
            authority,
          });

        /*
         * JOIN acknowledgement closes the transport
         * lifecycle only.
         *
         * Once authenticated + authorized room membership
         * succeeds, the client is joined regardless of the
         * outcome of a later durable combat-start attempt.
         */
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

        if (readiness.bothReady) {
          /*
           * Readiness is only a trigger.
           *
           * Durable start is intentionally isolated from
           * JOIN acknowledgement semantics:
           *
           *   success -> canonical turn-state event
           *   failure -> sanitized start-error event
           *
           * Never roll back room membership as compensation.
           * PostgreSQL may already have committed canonical
           * state even if a later transport operation fails.
           */
          try {
            const turnState =
              await resolveMatchCombatStartAuthority(
                authority
              );

            io.to(
              authority.room
            ).emit(
              "cing-artillery:match:turn-state",
              turnState
            );
          } catch (startError) {
            io.to(
              authority.room
            ).emit(
              "cing-artillery:match:start-error",
              {
                match_id:
                  authority.matchId,

                error:
                  serializeError(
                    startError
                  ),
              }
            );
          }
        }
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
    "cing-artillery:match:shot-command",
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
         * Re-authenticate every gameplay command.
         *
         * Socket room membership is transport state and is
         * intentionally NOT used as durable gameplay authority.
         */
        const identity =
          await authenticateSocket(
            socket
          );

        const {
          shotCommand,
        } =
          await acceptRealtimeShotCommand({
            userId:
              identity.userId,

            payload,
          });

        /*
         * ACK accepted durable command to the caller only.
         *
         * Do NOT broadcast this command as gameplay execution.
         * Durable shot execution will later produce the
         * canonical result event after processing completes.
         */
        respond({
          success:
            true,

          data:
            shotCommand,
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

  let disconnectMatchIds = [];

  /*
   * Socket.IO emits "disconnecting" before leaveAll().
   * Capture only canonical Artillery match identifiers here.
   * No readiness calculation is allowed until "disconnect",
   * when adapter room membership has already been cleaned.
   */
  socket.on(
    "disconnecting",
    () => {
      disconnectMatchIds =
        Array.from(
          socket.rooms || []
        )
          .map(
            parseMatchRoomName
          )
          .filter(Boolean);
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

        const readiness =
          await broadcastMatchReadiness({
            io,
            authority,
          });

        respond({
          success:
            true,

          data: {
            match_id:
              authority.matchId,

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
    "disconnect",
    async () => {
      const matchIds =
        Array.from(
          new Set(
            disconnectMatchIds
          )
        );

      disconnectMatchIds = [];

      for (const matchId of matchIds) {
        try {
          /*
           * This runs after Socket.IO _cleanup()/leaveAll().
           * fetchSockets() therefore observes canonical
           * post-disconnect adapter membership.
           *
           * Durable match/runtime/session state is never
           * mutated by transport disconnect.
           */
          const authority =
            await resolveMatchReadinessAuthorityByMatchId(
              matchId
            );

          if (!authority) {
            continue;
          }

          await broadcastMatchReadiness({
            io,
            authority,
          });
        } catch (_error) {
          /*
           * Disconnect has no acknowledgement channel.
           * Readiness is ephemeral and will be recomputed
           * again on the next authorized join/leave.
           *
           * Do not mutate durable state as compensation.
           */
        }
      }
    }
  );
}

module.exports = {
  registerCingArtilleryRealtimeConnection,
};

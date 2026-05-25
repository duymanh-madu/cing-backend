const {

  getRuntimeSnapshot,

} = require(
  "../../services/runtime/runtimeSnapshotService"
);

/**
 * =====================================================
 * RUNTIME SOCKET HANDLER
 * =====================================================
 */

function runtimeSocketHandler({

  socket,

}) {

  /**
   * ===================================================
   * SNAPSHOT
   * ===================================================
   */

  socket.on(

    "runtime:snapshot",

    () => {

      socket.emit(

        "runtime:snapshot:data",

        getRuntimeSnapshot()

      );

    }

  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports =

  runtimeSocketHandler;
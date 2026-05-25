let ioInstance =
  null;

/**
 * =====================================================
 * REGISTER IO
 * =====================================================
 */

function registerAdminRuntimeIO(
  io
) {

  ioInstance = io;

}

/**
 * =====================================================
 * BROADCAST RUNTIME UPDATE
 * =====================================================
 */

function broadcastRuntimeUpdate({

  type,

  payload,

}) {

  if (!ioInstance) {

    return;

  }

  ioInstance.emit(

    "admin:runtime:update",

    {

      type,

      payload,

      timestamp:
        Date.now(),

    }

  );

}

/**
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  registerAdminRuntimeIO,

  broadcastRuntimeUpdate,

};
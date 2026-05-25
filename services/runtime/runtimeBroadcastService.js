let ioInstance =
  null;

/**
 * =====================================================
 * REGISTER IO
 * =====================================================
 */

function registerRuntimeIO(
  io
) {

  ioInstance = io;

}

/**
 * =====================================================
 * BROADCAST RUNTIME EVENT
 * =====================================================
 */

function broadcastRuntimeEvent({

  channel,

  type,

  payload,

}) {

  if (!ioInstance) {

    return;

  }

  ioInstance.to(
    channel
  ).emit(

    "runtime:event",

    {

      channel,

      type,

      payload,

      timestamp:
        Date.now(),

    }

  );

}

/**
 * =====================================================
 * BROADCAST GLOBAL
 * =====================================================
 */

function broadcastGlobalRuntime({

  type,

  payload,

}) {

  if (!ioInstance) {

    return;

  }

  ioInstance.emit(

    "runtime:global",

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

  registerRuntimeIO,

  broadcastRuntimeEvent,

  broadcastGlobalRuntime,

};
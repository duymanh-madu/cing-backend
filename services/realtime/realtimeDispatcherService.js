const logger = require("../loggerService");

const DELIVERY_TYPES = {
  BROADCAST: "BROADCAST",
  ROOM: "ROOM",
  SOCKET: "SOCKET",
  USER: "USER",
};

function dispatchRealtimeEvent({ io, realtimeEvent }) {
  try {
    if (!io) return;
    
    if (realtimeEvent.delivery_type === DELIVERY_TYPES.BROADCAST) {
      io.emit(realtimeEvent.event, realtimeEvent.payload);
    } else if (realtimeEvent.delivery_type === DELIVERY_TYPES.ROOM && realtimeEvent.room) {
      io.to(realtimeEvent.room).emit(realtimeEvent.event, realtimeEvent.payload);
    } else if (realtimeEvent.delivery_type === DELIVERY_TYPES.SOCKET && realtimeEvent.socket_id) {
      io.to(realtimeEvent.socket_id).emit(realtimeEvent.event, realtimeEvent.payload);
    } else if (realtimeEvent.delivery_type === "USER" && realtimeEvent.target_user_id) {
      const userRoom = "member:" + realtimeEvent.target_user_id;
      io.to(userRoom).emit(realtimeEvent.event, realtimeEvent.payload);
    } else {
      // Default: broadcast
      io.emit(realtimeEvent.event, realtimeEvent.payload);
    }
  } catch(err) {
    logger.error("dispatchRealtimeEvent failed", { error: err.message });
  }
}

module.exports = { dispatchRealtimeEvent, DELIVERY_TYPES };

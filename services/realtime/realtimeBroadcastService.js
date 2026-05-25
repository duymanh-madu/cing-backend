async function broadcastToAll({

  io,

  event,

  payload,

}) {

  io.emit(
    event,
    payload
  );

}

async function broadcastToRoom({

  io,

  room,

  event,

  payload,

}) {

  io.to(room).emit(

    event,

    payload

  );

}

async function broadcastToSocket({

  io,

  socketId,

  event,

  payload,

}) {

  io.to(socketId).emit(

    event,

    payload

  );

}

module.exports = {

  broadcastToAll,

  broadcastToRoom,

  broadcastToSocket,

};
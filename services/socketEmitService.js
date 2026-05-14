function emitToUser({

  user_id,

  event,

  payload,

}) {

  try {

    const io =
      global.io;

    if (!io) {

      return;

    }

    io.to(

      `user:${user_id}`

    ).emit(

      event,

      payload

    );

  } catch (error) {

    console.error(

      "emitToUser error:",

      error.message

    );

  }

}

function emitToAdmin({

  room = "admin",

  event,

  payload,

}) {

  try {

    const io =
      global.io;

    if (!io) {

      return;

    }

    io.to(room).emit(

      event,

      payload

    );

  } catch (error) {

    console.error(

      "emitToAdmin error:",

      error.message

    );

  }

}

module.exports = {

  emitToUser,

  emitToAdmin,

};
const onlineUsers =
  new Map();

function setUserOnline({

  userId,

  socketId,

}) {

  onlineUsers.set(

    userId,

    {

      socketId,

      onlineAt:
        Date.now(),

    }

  );

}

function setUserOffline(
  userId
) {

  onlineUsers.delete(
    userId
  );

}

function isUserOnline(
  userId
) {

  return onlineUsers.has(
    userId
  );

}

function getOnlineUser(
  userId
) {

  return onlineUsers.get(
    userId
  );

}

function getOnlineUsersCount() {

  return onlineUsers.size;

}

module.exports = {

  setUserOnline,

  setUserOffline,

  isUserOnline,

  getOnlineUser,

  getOnlineUsersCount,

};
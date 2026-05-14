function getUserRoom(
  user_id
) {

  return `user:${user_id}`;

}

function getDeliveryRoom(
  tracking_code
) {

  return `delivery:${tracking_code}`;

}

function getAdminRoom(
  room = "admin"
) {

  return room;

}

module.exports = {

  getUserRoom,

  getDeliveryRoom,

  getAdminRoom,

};
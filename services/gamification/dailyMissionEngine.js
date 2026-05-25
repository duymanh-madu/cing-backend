const dailyMissions = [

  {

    id:
      "daily_login",

    title:
      "Đăng nhập hôm nay",

    xp:
      10,

  },

  {

    id:
      "play_game",

    title:
      "Chơi 1 mini game",

    xp:
      20,

  },

  {

    id:
      "create_order",

    title:
      "Tạo đơn hàng",

    xp:
      30,

  },

];

function getDailyMissions() {

  return dailyMissions;

}

module.exports = {

  getDailyMissions,

};
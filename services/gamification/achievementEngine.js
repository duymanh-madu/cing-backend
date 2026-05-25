const achievements = [

  {

    id:
      "first_order",

    title:
      "🧋 Đơn đầu tiên",

    condition:
      (stats) =>
        stats.orders >= 1,

  },

  {

    id:
      "game_master",

    title:
      "🎮 Game Master",

    condition:
      (stats) =>
        stats.gamesWon >= 10,

  },

  {

    id:
      "voucher_hunter",

    title:
      "🎁 Voucher Hunter",

    condition:
      (stats) =>
        stats.vouchersClaimed >= 5,

  },

];

function checkAchievements(
  stats
) {

  return achievements.filter(

    (
      achievement
    ) =>

      achievement.condition(
        stats
      )

  );

}

module.exports = {

  achievements,

  checkAchievements,

};
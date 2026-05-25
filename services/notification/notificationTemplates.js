/**
 * =====================================================
 * NOTIFICATION TEMPLATES
 * =====================================================
 */

const notificationTemplates = {

  /**
   * ===================================================
   * WELCOME
   * ===================================================
   */

  WELCOME: {

    title:
      "🎉 Chào mừng bạn",

    message:
      "Khám phá ưu đãi và mini game mới nhất ngay hôm nay.",

    type:
      "system",

  },

  /**
   * ===================================================
   * VOUCHER
   * ===================================================
   */

  VOUCHER_RECEIVED: {

    title:
      "🎁 Bạn nhận được voucher mới",

    message:
      "Voucher ưu đãi mới đã được thêm vào tài khoản của bạn.",

    type:
      "voucher",

  },

  /**
   * ===================================================
   * ORDER
   * ===================================================
   */

  ORDER_CREATED: {

    title:
      "🧋 Đơn hàng đã tạo",

    message:
      "Đơn hàng của bạn đang được xử lý.",

    type:
      "order",

  },

  ORDER_COMPLETED: {

    title:
      "✅ Đơn hàng hoàn tất",

    message:
      "Cảm ơn bạn đã mua hàng tại Cing Hu Tang.",

    type:
      "order",

  },

  /**
   * ===================================================
   * GAME
   * ===================================================
   */

  GAME_REWARD: {

    title:
      "🎮 Bạn vừa nhận thưởng",

    message:
      "Phần thưởng mini game đã được cộng vào tài khoản.",

    type:
      "game",

  },

  /**
   * ===================================================
   * LEADERBOARD
   * ===================================================
   */

  LEADERBOARD_PROMOTION: {

    title:
      "🏆 BXH đã thay đổi",

    message:
      "Bạn vừa tăng hạng trên bảng xếp hạng.",

    type:
      "leaderboard",

  },

  /**
   * ===================================================
   * CAMPAIGN
   * ===================================================
   */

  CAMPAIGN_BROADCAST: {

    title:
      "🔥 Ưu đãi mới hôm nay",

    message:
      "Khám phá chiến dịch mới và nhận quà ngay.",

    type:
      "campaign",

  },

};

module.exports =
  notificationTemplates;
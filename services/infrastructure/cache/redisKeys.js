const redisKeys = {
  userProfile: (userId) =>
    `user:${userId}:profile`,

  userSession: (userId) =>
    `user:${userId}:session`,

  menuItems: () =>
    "menu:items",

  menuCategory: (categoryId) =>
    `menu:category:${categoryId}`,

  leaderboardDaily: () =>
    "leaderboard:daily",

  leaderboardWeekly: () =>
    "leaderboard:weekly",

  leaderboardMonthly: () =>
    "leaderboard:monthly",

  gamePlayer: (playerId) =>
    `game:player:${playerId}`,

  gameRoom: (roomId) =>
    `game:room:${roomId}`,

  activeCampaigns: () =>
    "campaigns:active",

  popupCampaigns: () =>
    "campaigns:popup",

  appConfig: () =>
    "app:config",

  featureFlags: () =>
    "app:feature_flags",

  notificationQueue: () =>
    "notifications:queue",

  realtimePresence: (userId) =>
    `presence:${userId}`,

  deliveryTracking: (orderId) =>
    `delivery:${orderId}`,

  socketRoom: (roomId) =>
    `socket:room:${roomId}`,
};

module.exports = redisKeys;
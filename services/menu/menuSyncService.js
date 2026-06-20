const { fetchIPOSMenu } = require("./iposMenuClient");
const { getActiveMenuItems, syncMenuItems } = require("./menuRepository");

const MIN_HEALTHY_MENU_COUNT = Number(process.env.MIN_HEALTHY_MENU_COUNT || 80);

async function refreshMenuFromIPOS({ reason = "manual", eventPayload = null } = {}) {
  const startedAt = Date.now();
  const live = await fetchIPOSMenu();

  if (!live.success || live.count === 0) {
    console.warn("[MENU SYNC] failed empty iPOS menu", {
      reason,
      attempts: live.attempts,
    });

    return {
      success: false,
      reason: live.reason || "ipos_menu_empty",
      count: 0,
      attempts: live.attempts || [],
      durationMs: Date.now() - startedAt,
    };
  }

  if (live.count < MIN_HEALTHY_MENU_COUNT) {
    console.warn("[MENU SYNC] suspicious low menu count", {
      reason,
      count: live.count,
      min: MIN_HEALTHY_MENU_COUNT,
      attempts: live.attempts,
    });

    return {
      success: false,
      reason: "suspicious_low_menu_count",
      count: live.count,
      minHealthyCount: MIN_HEALTHY_MENU_COUNT,
      attempts: live.attempts || [],
      durationMs: Date.now() - startedAt,
    };
  }

  const dbSync = await syncMenuItems(live.items);

  console.log("[MENU SYNC] success", {
    reason,
    count: live.count,
    menuType: live.menuType,
    dbSync,
    durationMs: Date.now() - startedAt,
  });

  return {
    success: true,
    source: "ipos",
    reason,
    count: live.count,
    menuType: live.menuType,
    trackid: live.trackid,
    dbSync,
    attempts: live.attempts || [],
    durationMs: Date.now() - startedAt,
    items: live.items,
  };
}

async function getMenuForApp() {
  return getActiveMenuItems();
}

module.exports = {
  refreshMenuFromIPOS,
  getMenuForApp,
};

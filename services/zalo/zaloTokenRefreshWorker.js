const { refreshZaloToken } = require("../../routes/zaloOaRoutes");

const REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20 giờ

function startZaloTokenRefreshWorker() {
  console.log("[ZALO TOKEN] Auto-refresh worker started, interval: 20h");

  // Refresh ngay lúc khởi động (phòng trường hợp token gần hết hạn)
  setTimeout(() => {
    refreshZaloToken().then(token => {
      if (token) console.log("[ZALO TOKEN] Initial refresh OK");
      else console.warn("[ZALO TOKEN] Initial refresh failed");
    }).catch(e => console.warn("[ZALO TOKEN] Initial refresh error:", e.message));
  }, 30 * 1000);

  setInterval(() => {
    refreshZaloToken().then(token => {
      if (token) console.log("[ZALO TOKEN] Auto-refresh OK");
      else console.warn("[ZALO TOKEN] Auto-refresh failed");
    }).catch(e => console.warn("[ZALO TOKEN] Auto-refresh error:", e.message));
  }, REFRESH_INTERVAL_MS);
}

module.exports = { startZaloTokenRefreshWorker };

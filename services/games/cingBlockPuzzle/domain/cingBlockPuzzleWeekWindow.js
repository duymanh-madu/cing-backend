function weekWindow(now = Date.now()) {
  const local = new Date(now + 7 * 3600000);
  const start = Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate() - (local.getUTCDay()+6)%7) - 7*3600000;
  return {starts_at:new Date(start).toISOString(),ends_at:new Date(start+7*86400000).toISOString()};
}
module.exports = { weekWindow };

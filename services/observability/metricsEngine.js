const hook = require("./hooks/eventHook");

module.exports = {
  get: () => hook.snapshot()
};

class SyncDedupEngine {

  constructor() {
    this.cache = new Map();
  }

  isDuplicate(key) {
    return this.cache.has(key);
  }

  mark(key) {
    this.cache.set(key, Date.now());
  }

}

module.exports = new SyncDedupEngine();

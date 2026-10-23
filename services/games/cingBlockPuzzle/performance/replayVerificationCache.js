const { createHash } = require('node:crypto');
// Cache only deterministic verification, never ownership, balance or a transaction.
function createReplayVerificationCache(verify, { maxEntries = 64, ttlMs = 30000, now = Date.now } = {}) {
  const entries = new Map();
  return async function verifyCached(args) {
    const transcript = args?.transcript;
    const events = transcript?.events ?? transcript?.moves;
    if (!Array.isArray(events) || events.length > 10000) return verify(args);
    // Hash the complete raw transcript, not its canonical subset: unknown fields
    // must not borrow an earlier valid result. The authority tuple is part of key.
    const key = createHash('sha256').update(JSON.stringify({
      transcript, expectedSeed: args.expectedSeed, engineVersion: args.engineVersion,
      rulesVersion: args.rulesVersion, scoreVersion: args.scoreVersion,
      replayVersion: args.replayVersion, requireEnded: args.requireEnded === undefined ? true : args.requireEnded,
    })).digest('hex');
    const previous = entries.get(key);
    if (previous && previous.expiresAt > now()) return previous.promise;
    entries.delete(key);
    while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
    const entry = { expiresAt: Infinity, promise: null };
    // Defer one microtask so synchronous failures cannot leave a rejected entry.
    entry.promise = Promise.resolve().then(() => verify(args)).then(result => {
      entry.expiresAt = now() + ttlMs;
      return result;
    }, error => {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    });
    entries.set(key, entry);
    return entry.promise;
  };
}
module.exports = { createReplayVerificationCache };

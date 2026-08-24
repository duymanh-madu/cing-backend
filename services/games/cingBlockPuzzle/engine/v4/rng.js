function assertUint32(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new TypeError(`${name} must be uint32`);
  }
}

export function normalizeSeed(seed) {
  const n = Number(seed);

  if (!Number.isFinite(n)) {
    throw new TypeError("seed must be finite");
  }

  const normalized = Math.trunc(n) >>> 0;

  // xorshift32 may become permanently zero.
  return normalized === 0 ? 0x6d2b79f5 : normalized;
}

export function nextUint32(state) {
  assertUint32(state, "rng state");

  let x = state >>> 0;

  x ^= (x << 13) >>> 0;
  x ^= x >>> 17;
  x ^= (x << 5) >>> 0;

  return x >>> 0;
}

export function nextInt(state, maxExclusive) {
  assertUint32(state, "rng state");

  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError("maxExclusive must be a positive integer");
  }

  const nextState = nextUint32(state);

  return {
    state: nextState,
    value: nextState % maxExclusive,
  };
}

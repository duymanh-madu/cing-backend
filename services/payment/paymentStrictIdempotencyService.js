class PaymentStrictIdempotencyService {

  constructor() {
    this.store = new Map();
  }

  execute(key, fn) {

    if (this.store.has(key)) {
      return {
        status: "DUPLICATE_BLOCKED",
        cached: this.store.get(key)
      };
    }

    const result = fn();

    this.store.set(key, result);

    return result;
  }

}

module.exports = new PaymentStrictIdempotencyService();

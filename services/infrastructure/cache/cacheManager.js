const MemoryCacheAdapter =
  require(
    "./adapters/memoryCacheAdapter"
  );

class CacheManager {

  constructor() {

    this.adapter =
      new MemoryCacheAdapter();

  }

  async set(payload) {

    return this.adapter.set(
      payload
    );

  }

  async get(key) {

    return this.adapter.get(
      key
    );

  }

  async delete(key) {

    return this.adapter.delete(
      key
    );

  }

  async clear() {

    return this.adapter.clear();

  }

  async stats() {

    return this.adapter.stats();

  }

}

module.exports =
  new CacheManager();
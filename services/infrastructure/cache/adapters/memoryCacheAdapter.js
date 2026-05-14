class MemoryCacheAdapter {

  constructor() {

    this.store =
      new Map();

    this.startCleanup();

  }

  set({

    key,

    value,

    ttl = 60000,

  }) {

    this.store.set(

      key,

      {

        value,

        expires_at:

          Date.now() + ttl,

      }

    );

  }

  get(key) {

    const cached =

      this.store.get(key);

    if (!cached) {

      return null;

    }

    if (

      Date.now() >

      cached.expires_at

    ) {

      this.store.delete(key);

      return null;

    }

    return cached.value;

  }

  delete(key) {

    this.store.delete(key);

  }

  clear() {

    this.store.clear();

  }

  stats() {

    return {

      size:
        this.store.size,

    };

  }

  startCleanup() {

    setInterval(

      () => {

        const now =
          Date.now();

        for (

          const [

            key,

            value,

          ]

          of this.store

        ) {

          if (

            now >

            value.expires_at

          ) {

            this.store.delete(
              key
            );

          }

        }

      },

      30000

    );

  }

}

module.exports =
  MemoryCacheAdapter;
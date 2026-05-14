function formatLog({

  level,

  message,

  metadata = {},

}) {

  return {

    level,

    message,

    timestamp:
      new Date().toISOString(),

    environment:

      process.env.NODE_ENV ||

      "development",

    metadata,

  };

}

module.exports = {

  formatLog,

};
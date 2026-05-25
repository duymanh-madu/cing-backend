module.exports = (app) => {
  app.use("/api/obs", require("../../routes/observability"));
};

const supabase =
  require("../supabase");

module.exports =
  async function (
    req,
    res,
    next
  ) {

    const start =
      Date.now();

    const originalSend =
      res.send;

    res.send =
      function (body) {

        const responseTime =

          Date.now() -
          start;

        /**
         * SAVE LOG
         */

        supabase

          .from("api_logs")

          .insert({

            method:
              req.method,

            endpoint:
              req.originalUrl,

            ip:
              req.ip,

            user_agent:
              req.headers[
                "user-agent"
              ],

            status_code:
              res.statusCode,

            response_time:
              responseTime,

          })

          .then();

        return originalSend.call(
          this,
          body
        );

      };

    next();

  };
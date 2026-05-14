const axios =
  require("axios");

async function getDistanceMatrix({

  origin,

  destination,

}) {

  const response =
    await axios.get(

      "https://maps.googleapis.com/maps/api/distancematrix/json",

      {

        params: {

          origins:
            origin,

          destinations:
            destination,

          key:
            process.env
              .GOOGLE_MAP_API_KEY,

        },

      }

    );

  return response.data;

}

module.exports = {

  getDistanceMatrix,

};
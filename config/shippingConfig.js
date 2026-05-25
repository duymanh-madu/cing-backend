const shippingConfig = {

  freeShipMinimum: 300000,

  distanceRules: [

    {
      minKm: 0,
      maxKm: 2,
      fee: 15000,
    },

    {
      minKm: 2,
      maxKm: 5,
      fee: 25000,
    },

    {
      minKm: 5,
      maxKm: 8,
      fee: 35000,
    },

    {
      minKm: 8,
      maxKm: 999,
      fee: 50000,
    },

  ],

};

module.exports =
  shippingConfig;
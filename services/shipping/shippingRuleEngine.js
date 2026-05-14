function calculateDistanceFee({

  distance_km,

  fee_per_km,

}) {

  return Math.ceil(

    Number(distance_km) *

    Number(fee_per_km)

  );

}

module.exports = {

  calculateDistanceFee,

};
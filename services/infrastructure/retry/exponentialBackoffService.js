function getBackoffDelay({

  attempt,

  base_delay,

}) {

  return (

    base_delay *

    Math.pow(

      2,

      attempt

    )

  );

}

module.exports = {

  getBackoffDelay,

};
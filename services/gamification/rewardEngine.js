const crypto =
  require("crypto");

function generateReward({

  type,

  amount,
  
}) {

  return {

    id:
      crypto.randomUUID(),

    type,

    amount,

    createdAt:
      new Date().toISOString(),

  };

}

module.exports = {

  generateReward,

};
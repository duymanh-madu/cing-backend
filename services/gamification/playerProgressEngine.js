const {

  calculateLevel,

} = require(
  "./levelEngine"
);

function buildPlayerProgress({

  xp,

  streak,

  achievements,

}) {

  const level =
    calculateLevel(
      xp
    );

  return {

    xp,

    level,

    streak,

    achievements,

    updatedAt:
      new Date().toISOString(),

  };

}

module.exports = {

  buildPlayerProgress,

};
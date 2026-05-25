/**
 * =====================================================
 * LEVEL ENGINE
 * =====================================================
 */

const LEVEL_XP_TABLE = {

  1: 0,
  2: 100,
  3: 250,
  4: 500,
  5: 900,
  6: 1400,
  7: 2000,
  8: 2800,
  9: 3800,
  10: 5000,

};

function calculateLevel(
  xp
) {

  let currentLevel =
    1;

  for (
    const [
      level,
      requiredXP,
    ] of Object.entries(
      LEVEL_XP_TABLE
    )
  ) {

    if (
      xp >= requiredXP
    ) {

      currentLevel =
        Number(level);

    }

  }

  return currentLevel;

}

function getNextLevelXP(
  level
) {

  return (
    LEVEL_XP_TABLE[
      level + 1
    ] || null
  );

}

module.exports = {

  LEVEL_XP_TABLE,

  calculateLevel,

  getNextLevelXP,

};
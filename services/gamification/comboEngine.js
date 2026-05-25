function calculateComboMultiplier(
  combo
) {

  if (combo >= 20) {

    return 3;

  }

  if (combo >= 10) {

    return 2;

  }

  return 1;

}

module.exports = {

  calculateComboMultiplier,

};
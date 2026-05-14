function isMenuItemAvailable(
  item
) {

  if (!item) {

    return false;

  }

  if (!item.is_active) {

    return false;

  }

  if (item.is_sold_out) {

    return false;

  }

  return true;

}

module.exports = {

  isMenuItemAvailable,

};
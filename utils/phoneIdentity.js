function normalizePhone(input) {
  if (!input) return "";

  let phone = String(input).replace(/\D/g, "");

  if (phone.startsWith("84") && phone.length >= 11) {
    phone = "0" + phone.slice(2);
  }

  if (phone.startsWith("9") && phone.length === 9) {
    phone = "0" + phone;
  }

  return phone;
}

function toInternationalPhone(input) {
  const phone = normalizePhone(input);
  if (!phone) return "";
  return phone.startsWith("0") ? `84${phone.slice(1)}` : phone;
}

function phoneVariants(input) {
  const local = normalizePhone(input);
  const intl = toInternationalPhone(local);
  return [...new Set([local, intl].filter(Boolean))];
}

module.exports = {
  normalizePhone,
  toInternationalPhone,
  phoneVariants,
};

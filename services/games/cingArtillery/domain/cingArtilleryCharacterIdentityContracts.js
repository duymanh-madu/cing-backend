const CHARACTER_NAME_MIN_LENGTH =
  2;

const CHARACTER_NAME_MAX_LENGTH =
  20;

const CING_ARTILLERY_GENDER =
  Object.freeze({
    MALE:
      "male",

    FEMALE:
      "female",
  });

const VALID_GENDERS =
  new Set(
    Object.values(
      CING_ARTILLERY_GENDER
    )
  );

function normalizeCharacterName(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .replace(
      /\s+/gu,
      " "
    );
}

function assertCharacterName(
  value
) {
  const characterName =
    normalizeCharacterName(
      value
    );

  const characterLength =
    [
      ...characterName,
    ].length;

  if (
    characterLength <
      CHARACTER_NAME_MIN_LENGTH ||
    characterLength >
      CHARACTER_NAME_MAX_LENGTH
  ) {
    const error =
      new Error(
        `Tên nhân vật Cing Artillery phải có từ ${CHARACTER_NAME_MIN_LENGTH} đến ${CHARACTER_NAME_MAX_LENGTH} ký tự`
      );

    error.code =
      "CING_ARTILLERY_INVALID_CHARACTER_NAME";

    error.statusCode =
      400;

    throw error;
  }

  return characterName;
}

function normalizeGender(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
}

function assertGender(
  value
) {
  const gender =
    normalizeGender(
      value
    );

  if (
    !VALID_GENDERS.has(
      gender
    )
  ) {
    const error =
      new Error(
        "Giới tính nhân vật Cing Artillery không hợp lệ"
      );

    error.code =
      "CING_ARTILLERY_INVALID_GENDER";

    error.statusCode =
      400;

    throw error;
  }

  return gender;
}

module.exports = {
  CHARACTER_NAME_MIN_LENGTH,
  CHARACTER_NAME_MAX_LENGTH,
  CING_ARTILLERY_GENDER,
  normalizeCharacterName,
  assertCharacterName,
  normalizeGender,
  assertGender,
};

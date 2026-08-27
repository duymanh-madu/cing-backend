const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const supabase = require("../supabase");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "cing-admin-secret-2026";

function requireAdmin(
  req,
  res,
  next
) {
  const token =
    req.headers.authorization
      ?.replace(
        "Bearer ",
        ""
      );

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  try {
    req.admin =
      jwt.verify(
        token,
        JWT_SECRET
      );

    next();
  } catch {
    res.status(401).json({
      success: false,
      message:
        "Token không hợp lệ",
    });
  }
}

function parseNonNegativeInteger(
  value,
  field,
  defaultValue = 0
) {
  const raw =
    value === undefined ||
    value === null ||
    value === ""
      ? defaultValue
      : Number(value);

  if (
    !Number.isSafeInteger(raw) ||
    raw < 0
  ) {
    const error =
      new Error(
        `${field} phải là số nguyên không âm`
      );

    error.statusCode = 400;
    throw error;
  }

  return raw;
}

function buildMissionPayload(
  body,
  {
    isCreate = false,
  } = {}
) {
  const {
    type,
    label,
    description,
    plays,
    points,
    enabled,
    icon,
    condition_type,
    condition_value,
  } = body;

  if (
    isCreate &&
    (!type || !label)
  ) {
    const error =
      new Error(
        "Thiếu type hoặc label"
      );

    error.statusCode = 400;
    throw error;
  }

  const normalizedPlays =
    parseNonNegativeInteger(
      plays,
      "plays",
      0
    );

  const normalizedPoints =
    parseNonNegativeInteger(
      points,
      "points",
      0
    );

  if (
    normalizedPlays === 0 &&
    normalizedPoints === 0
  ) {
    const error =
      new Error(
        "Nhiệm vụ phải thưởng ít nhất điểm tích luỹ hoặc lượt chơi"
      );

    error.statusCode = 400;
    throw error;
  }

  return {
    type,
    label,
    description,

    plays:
      normalizedPlays,

    points:
      normalizedPoints,

    enabled:
      isCreate
        ? enabled !== false
        : enabled,

    icon:
      isCreate
        ? icon || "🎯"
        : icon,

    condition_type:
      isCreate
        ? condition_type ||
          "manual"
        : condition_type,

    condition_value:
      parseNonNegativeInteger(
        condition_value,
        "condition_value",
        0
      ),
  };
}

router.get(
  "/",
  requireAdmin,
  async (req, res) => {
    const {
      data,
      error,
    } = await supabase
      .from(
        "mission_configs"
      )
      .select("*")
      .order("created_at");

    if (error) {
      return res
        .status(500)
        .json({
          success: false,
          error:
            error.message,
        });
    }

    res.json({
      success: true,
      data:
        data || [],
    });
  }
);

router.post(
  "/",
  requireAdmin,
  async (req, res) => {
    try {
      const payload =
        buildMissionPayload(
          req.body,
          {
            isCreate: true,
          }
        );

      const {
        data,
        error,
      } = await supabase
        .from(
          "mission_configs"
        )
        .insert(
          payload
        )
        .select()
        .single();

      if (error) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              error.message,
          });
      }

      const {
        clearMissionCache,
      } = require(
        "../services/dailyMissionService"
      );

      clearMissionCache();

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      res
        .status(
          error.statusCode ||
          400
        )
        .json({
          success: false,
          message:
            error.message,
        });
    }
  }
);

router.put(
  "/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const payload =
        buildMissionPayload(
          req.body
        );

      payload.updated_at =
        new Date().toISOString();

      const {
        data,
        error,
      } = await supabase
        .from(
          "mission_configs"
        )
        .update(
          payload
        )
        .eq(
          "id",
          req.params.id
        )
        .select()
        .single();

      if (error) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              error.message,
          });
      }

      const {
        clearMissionCache,
      } = require(
        "../services/dailyMissionService"
      );

      clearMissionCache();

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      res
        .status(
          error.statusCode ||
          400
        )
        .json({
          success: false,
          message:
            error.message,
        });
    }
  }
);

router.delete(
  "/:id",
  requireAdmin,
  async (req, res) => {
    const {
      error,
    } = await supabase
      .from(
        "mission_configs"
      )
      .delete()
      .eq(
        "id",
        req.params.id
      );

    if (error) {
      return res
        .status(400)
        .json({
          success: false,
          error:
            error.message,
        });
    }

    const {
      clearMissionCache,
    } = require(
      "../services/dailyMissionService"
    );

    clearMissionCache();

    res.json({
      success: true,
    });
  }
);

module.exports =
  router;

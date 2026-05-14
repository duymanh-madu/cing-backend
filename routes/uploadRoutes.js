const express =
  require("express");

const multer =
  require("multer");

const adminAuth =
  require(
    "../middlewares/adminAuth"
  );

const {

  uploadImage,

} = require(

  "../services/storageService"

);

const router =
  express.Router();

/**
 * =====================================================
 * MULTER MEMORY
 * =====================================================
 */

const upload =
  multer({

    storage:
      multer.memoryStorage(),

  });

/**
 * =====================================================
 * TEST
 * =====================================================
 */

router.get(
  "/test",
  async (req, res) => {

    res.json({

      success: true,

      route:
        "upload routes working",

    });

  }
);

/**
 * =====================================================
 * UPLOAD IMAGE
 * =====================================================
 */

router.post(

  "/image",

  adminAuth,

  upload.single(
    "image"
  ),

  async (
    req,
    res
  ) => {

    try {

      const bucket =

        req.body.bucket;

      if (
        !req.file
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Missing image",

        });

      }

      const result =
        await uploadImage({

          bucket,

          fileBuffer:
            req.file.buffer,

          fileName:
            req.file.originalname,

          contentType:
            req.file.mimetype,

        });

      if (
        !result.success
      ) {

        return res.status(500).json({

          success: false,

          error:
            result.error,

        });

      }

      res.json({

        success: true,

        image_url:
          result.publicUrl,

      });

    } catch (error) {

      console.log(error);

      res.status(500).json({

        success: false,

        error:
          error.message,

      });

    }

  }

);

module.exports =
  router;
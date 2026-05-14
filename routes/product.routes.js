const express =
  require("express");

const router =
  express.Router();

/**
 * =========================================================
 * SERVICES
 * =========================================================
 */

const {

  getFeaturedProducts,

  getProductById,

  searchProducts,

} = require(
  "../services/productService"
);

/**
 * =========================================================
 * FEATURED PRODUCTS
 * =========================================================
 */

router.get(

  "/featured",

  async (
    req,
    res
  ) => {

    try {

      const products =

        await getFeaturedProducts();

      return res
        .status(200)
        .json({

          success: true,

          data: products,

        });

    } catch (error) {

      console.error(

        "[FEATURED PRODUCTS ERROR]",

        error

      );

      return res
        .status(500)
        .json({

          success: false,

          message:
            "Failed to fetch featured products",

        });

    }

  }

);

/**
 * =========================================================
 * PRODUCT DETAIL
 * =========================================================
 */

router.get(

  "/:productId",

  async (
    req,
    res
  ) => {

    try {

      const {
        productId,
      } = req.params;

      const product =

        await getProductById(
          productId
        );

      /**
       * ===============================================
       * NOT FOUND
       * ===============================================
       */

      if (!product) {

        return res
          .status(404)
          .json({

            success: false,

            message:
              "Product not found",

          });

      }

      return res
        .status(200)
        .json({

          success: true,

          data: product,

        });

    } catch (error) {

      console.error(

        "[PRODUCT DETAIL ERROR]",

        error

      );

      return res
        .status(500)
        .json({

          success: false,

          message:
            "Failed to fetch product",

        });

    }

  }

);

/**
 * =========================================================
 * SEARCH PRODUCTS
 * =========================================================
 */

router.get(

  "/search/query",

  async (
    req,
    res
  ) => {

    try {

      const keyword =

        req.query.keyword ||
        "";

      const products =

        await searchProducts(
          keyword
        );

      return res
        .status(200)
        .json({

          success: true,

          data: products,

        });

    } catch (error) {

      console.error(

        "[SEARCH PRODUCTS ERROR]",

        error

      );

      return res
        .status(500)
        .json({

          success: false,

          message:
            "Failed to search products",

        });

    }

  }

);

/**
 * =========================================================
 * EXPORTS
 * =========================================================
 */

module.exports =
  router;
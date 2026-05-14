const supabase =
  require("../supabase");

/**
 * =====================================================
 * UPLOAD IMAGE
 * =====================================================
 */

async function uploadImage({

  bucket,
  fileBuffer,
  fileName,
  contentType,

}) {

  try {

    const filePath =

      `${Date.now()}-${fileName}`;

    /**
     * UPLOAD
     */

    const {
      error,
    } = await supabase

      .storage

      .from(bucket)

      .upload(

        filePath,

        fileBuffer,

        {

          contentType,

          upsert: false,

        }

      );

    if (error) {

      throw error;

    }

    /**
     * PUBLIC URL
     */

    const {

      data: publicUrlData,

    } = supabase

      .storage

      .from(bucket)

      .getPublicUrl(
        filePath
      );

    return {

      success: true,

      path:
        filePath,

      publicUrl:
        publicUrlData.publicUrl,

    };

  } catch (error) {

    console.log(error);

    return {

      success: false,

      error:
        error.message,

    };

  }

}

module.exports = {

  uploadImage,

};
// controllers/addSubCategoryController.js
import dotenv from "dotenv";
dotenv.config();

import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import db from "../db.js";
import path from "path";

// Config from .env (you confirmed these)
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_FOLDER = "AspireBrandStore";
const REGION = process.env.AWS_REGION;

// Create S3 client
const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Multer-S3 storage (public-read)
const s3Storage = multerS3({
  s3,
  bucket: S3_BUCKET,
  contentType: multerS3.AUTO_CONTENT_TYPE,  // keep this
  // ✅ ACL removed
  key: function (req, file, cb) {
    const ext = path.extname(file.originalname) || "";
    const filename = `${S3_FOLDER}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, filename);
  },
});


const uploadS3 = multer({ storage: s3Storage });

// Export middleware expecting FOUR required fields (U4)
const upload = uploadS3.fields([
  { name: "image_1", maxCount: 1 },
  { name: "image_2", maxCount: 1 },
  { name: "image_3", maxCount: 1 },
  { name: "image_4", maxCount: 1 },
]);

// Helper: extract S3 object key from S3 URL
function getS3KeyFromUrl(url) {
  if (!url) return null;
  const marker = ".amazonaws.com/";
  if (url.includes(marker)) {
    return url.split(marker)[1];
  }
  try {
    const u = new URL(url);
    let pathname = u.pathname;
    if (pathname.startsWith("/")) pathname = pathname.slice(1);
    const parts = pathname.split("/");
    if (parts[0] === S3_BUCKET) parts.shift();
    return parts.join("/");
  } catch (e) {
    return null;
  }
}

// Helper: delete single key from S3 (returns Promise)
async function deleteS3Object(key) {
  if (!key) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  } catch (err) {
    // best-effort: log but don't throw to upper flow
    console.warn("Failed to delete S3 object:", key, err?.message || err);
  }
}

// ----------------- CONTROLLERS -----------------

// ADD Sub Category (POST) -- requires all 4 images (U4)
export const addSubCategory = (req, res) => {
  try {
    // Received fields:
    // productCategory, subCategaryname, price, material, sku, brand, description, gender
    // Files: req.files.image_1[0], image_2[0], image_3[0], image_4[0]
    const {
      productCategory,
      subCategaryname,
      price,
      material,
      sku,
      brand,
      description,
      gender,
    } = req.body;

    // simple required validations (keep same as your old code)
    if (!productCategory || !subCategaryname || !price || !sku) {
      // If any files were uploaded, remove them (CLEAN)
      if (req.files) {
        const uploadedFiles = [
          req.files.image_1?.[0],
          req.files.image_2?.[0],
          req.files.image_3?.[0],
          req.files.image_4?.[0],
        ].filter(Boolean);
        for (const f of uploadedFiles) {
          const key = getS3KeyFromUrl(f.location || f.key || f.location);
          if (key) deleteS3Object(key);
        }
      }
      return res.status(400).json({
        message: "Product Category, Sub Category Name, Price, and SKU are required",
      });
    }

    // ensure all 4 images present (U4)
    const filesPresent =
      req.files &&
      req.files.image_1?.[0] &&
      req.files.image_2?.[0] &&
      req.files.image_3?.[0] &&
      req.files.image_4?.[0];

    if (!filesPresent) {
      // cleanup any partial uploads (CLEAN)
      if (req.files) {
        const partial = [
          req.files.image_1?.[0],
          req.files.image_2?.[0],
          req.files.image_3?.[0],
          req.files.image_4?.[0],
        ].filter(Boolean);
        for (const f of partial) {
          const key = getS3KeyFromUrl(f.location || f.key);
          if (key) deleteS3Object(key);
        }
      }
      return res.status(400).json({ message: "All 4 images (image_1..image_4) are required" });
    }

    const image_1 = req.files.image_1[0].location;
    const image_2 = req.files.image_2[0].location;
    const image_3 = req.files.image_3[0].location;
    const image_4 = req.files.image_4[0].location;

    // Duplicate check by SKU only (D1)
    const checkSql = "SELECT id FROM subcategories WHERE LOWER(sku) = LOWER(?)";
    db.query(checkSql, [sku], async (checkErr, results) => {
      if (checkErr) {
        console.error("❌ DB Check Error:", checkErr);
        // CLEAN uploaded files
        await Promise.all(
          [image_1, image_2, image_3, image_4].map((url) =>
            deleteS3Object(getS3KeyFromUrl(url))
          )
        );
        return res.status(500).json({ message: "Database error", error: checkErr });
      }

      if (results.length > 0) {
        // SKU duplicate -> CLEAN uploaded files
        await Promise.all(
          [image_1, image_2, image_3, image_4].map((url) =>
            deleteS3Object(getS3KeyFromUrl(url))
          )
        );
        return res.status(400).json({ message: "SKU already exists" });
      }

      // Insert into DB
      const sql = `
        INSERT INTO subcategories 
        (productCategory, subCategaryname, price, image_1, image_2, image_3, image_4, material, sku, brand, description, gender, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const createdAt = new Date().toISOString();
      db.query(
        sql,
        [
          productCategory,
          subCategaryname,
          price,
          image_1,
          image_2,
          image_3,
          image_4,
          material,
          sku,
          brand,
          description,
          gender,
          createdAt,
        ],
        (err, result) => {
          if (err) {
            console.error("❌ DB Insert Error:", err);
            // CLEAN uploaded files
            Promise.all(
              [image_1, image_2, image_3, image_4].map((url) =>
                deleteS3Object(getS3KeyFromUrl(url))
              )
            ).catch(() => {});
            return res.status(500).json({ message: "Database error", error: err });
          }
          console.log("✅ Sub Category added successfully:", result.insertId);
          return res.status(201).json({
            message: "Sub Category added successfully",
            subCategoryId: result.insertId,
          });
        }
      );
    });
  } catch (err) {
    console.error("Add SubCategory Error:", err);
    return res.status(500).json({ message: "Server error", error: err });
  }
};

// GET All Sub Categories
export const getSubCategories = (req, res) => {
  try {
    const sql = "SELECT * FROM subcategories ORDER BY id DESC";
    db.query(sql, (err, results) => {
      if (err) {
        console.error("DB Fetch Error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }
      return res.status(200).json(results);
    });
  } catch (err) {
    console.error("Get SubCategories Error:", err);
    return res.status(500).json({ message: "Server error", error: err });
  }
};

// UPDATE Sub Category (PUT) - replace image if new file provided; delete old images from S3
export const updateSubCategory = (req, res) => {
  try {
    const { id } = req.params;
    const {
      productCategory,
      subCategaryname,
      price,
      material,
      sku,
      brand,
      description,
      gender,
    } = req.body;

    // New files may or may not be provided; we support replacing any of the 4 images
    const image1File = req.files?.image_1?.[0];
    const image2File = req.files?.image_2?.[0];
    const image3File = req.files?.image_3?.[0];
    const image4File = req.files?.image_4?.[0];

    // Validate required fields if you want (keeping flexible like product example)
    if (!subCategaryname || !sku) {
      // optionally reject; here we'll allow partial updates as long as sku/name provided
      // (If you want to enforce, uncomment below)
      // return res.status(400).json({ message: "Sub Category name and SKU are required" });
    }

    // Check row exists
    const checkProductSql = "SELECT image_1, image_2, image_3, image_4 FROM subcategories WHERE id = ?";
    db.query(checkProductSql, [id], (checkErr, rows) => {
      if (checkErr) {
        console.error("DB Check Error:", checkErr);
        // cleanup newly uploaded files if any
        const uploaded = [image1File, image2File, image3File, image4File].filter(Boolean);
        uploaded.forEach((f) => {
          const key = getS3KeyFromUrl(f?.location || f?.key);
          if (key) deleteS3Object(key);
        });
        return res.status(500).json({ message: "Database error", error: checkErr });
      }

      if (rows.length === 0) {
        // cleanup newly uploaded files if any
        const uploaded = [image1File, image2File, image3File, image4File].filter(Boolean);
        uploaded.forEach((f) => {
          const key = getS3KeyFromUrl(f?.location || f?.key);
          if (key) deleteS3Object(key);
        });
        return res.status(404).json({ message: "Sub Category not found" });
      }

      // Duplicate SKU check excluding current id (D1)
      const dupCheckSql = "SELECT id FROM subcategories WHERE LOWER(sku) = LOWER(?) AND id != ?";
      db.query(dupCheckSql, [sku, id], async (dupErr, dupRes) => {
        if (dupErr) {
          console.error("DB Duplicate Check Error:", dupErr);
          // cleanup newly uploaded files
          const uploaded = [image1File, image2File, image3File, image4File].filter(Boolean);
          uploaded.forEach((f) => {
            const key = getS3KeyFromUrl(f?.location || f?.key);
            if (key) deleteS3Object(key);
          });
          return res.status(500).json({ message: "Database error", error: dupErr });
        }

        if (dupRes.length > 0) {
          // cleanup newly uploaded files
          const uploaded = [image1File, image2File, image3File, image4File].filter(Boolean);
          uploaded.forEach((f) => {
            const key = getS3KeyFromUrl(f?.location || f?.key);
            if (key) deleteS3Object(key);
          });
          return res.status(400).json({ message: "SKU already exists" });
        }

        const existing = rows[0];
        let updateFields = [];
        let params = [];

        // Prepare updates for simple fields
        if (productCategory) {
          updateFields.push("productCategory = ?");
          params.push(productCategory);
        }
        if (subCategaryname) {
          updateFields.push("subCategaryname = ?");
          params.push(subCategaryname);
        }
        if (price) {
          updateFields.push("price = ?");
          params.push(price);
        }
        if (material) {
          updateFields.push("material = ?");
          params.push(material);
        }
        if (sku) {
          updateFields.push("sku = ?");
          params.push(sku);
        }
        if (brand) {
          updateFields.push("brand = ?");
          params.push(brand);
        }
        if (description) {
          updateFields.push("description = ?");
          params.push(description);
        }
        if (gender) {
          updateFields.push("gender = ?");
          params.push(gender);
        }

        // For each image field: if new file uploaded -> delete old S3 and set new URL
        if (image1File) {
          const newUrl = image1File.location;
          // delete old
          const oldKey = getS3KeyFromUrl(existing.image_1);
          if (oldKey) {
            // best-effort synchronous delete via promise chain
            s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: oldKey })).catch((e) => {
              console.warn("Failed to delete old image_1:", e?.message || e);
            });
          }
          updateFields.push("image_1 = ?");
          params.push(newUrl);
        }
        if (image2File) {
          const newUrl = image2File.location;
          const oldKey = getS3KeyFromUrl(existing.image_2);
          if (oldKey) {
            s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: oldKey })).catch((e) => {
              console.warn("Failed to delete old image_2:", e?.message || e);
            });
          }
          updateFields.push("image_2 = ?");
          params.push(newUrl);
        }
        if (image3File) {
          const newUrl = image3File.location;
          const oldKey = getS3KeyFromUrl(existing.image_3);
          if (oldKey) {
            s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: oldKey })).catch((e) => {
              console.warn("Failed to delete old image_3:", e?.message || e);
            });
          }
          updateFields.push("image_3 = ?");
          params.push(newUrl);
        }
        if (image4File) {
          const newUrl = image4File.location;
          const oldKey = getS3KeyFromUrl(existing.image_4);
          if (oldKey) {
            s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: oldKey })).catch((e) => {
              console.warn("Failed to delete old image_4:", e?.message || e);
            });
          }
          updateFields.push("image_4 = ?");
          params.push(newUrl);
        }

        if (updateFields.length === 0) {
          return res.status(400).json({ message: "No fields provided for update" });
        }

        const sql = `UPDATE subcategories SET ${updateFields.join(", ")} WHERE id = ?`;
        params.push(id);

        db.query(sql, params, (err, result) => {
          if (err) {
            console.error("❌ DB Update Error:", err);
            // If update failed, attempt to cleanup newly uploaded files
            const uploaded = [image1File, image2File, image3File, image4File].filter(Boolean);
            uploaded.forEach((f) => {
              const key = getS3KeyFromUrl(f?.location || f?.key);
              if (key) deleteS3Object(key);
            });
            return res.status(500).json({ message: "Database error", error: err });
          }
          return res.status(200).json({ message: "Sub Category updated successfully" });
        });
      });
    });
  } catch (err) {
    console.error("Update SubCategory Error:", err);
    // cleanup newly uploaded files if any
    const uploaded = [
      req.files?.image_1?.[0],
      req.files?.image_2?.[0],
      req.files?.image_3?.[0],
      req.files?.image_4?.[0],
    ].filter(Boolean);
    uploaded.forEach((f) => {
      const key = getS3KeyFromUrl(f?.location || f?.key);
      if (key) deleteS3Object(key);
    });
    return res.status(500).json({ message: "Server error", error: err });
  }
};

// DELETE Sub Category
export const deleteSubCategory = (req, res) => {
  try {
    const { id } = req.params;
    const selectSql = "SELECT image_1, image_2, image_3, image_4 FROM subcategories WHERE id = ?";
    db.query(selectSql, [id], async (selErr, selRes) => {
      if (selErr) {
        console.error("DB Select Error:", selErr);
        return res.status(500).json({ message: "Database error", error: selErr });
      }

      if (selRes.length === 0) {
        return res.status(404).json({ message: "Sub Category not found" });
      }

      const { image_1, image_2, image_3, image_4 } = selRes[0];

      // Delete images from S3 (best-effort)
      const keys = [
        getS3KeyFromUrl(image_1),
        getS3KeyFromUrl(image_2),
        getS3KeyFromUrl(image_3),
        getS3KeyFromUrl(image_4),
      ].filter(Boolean);

      await Promise.all(keys.map((k) => deleteS3Object(k)));

      // Delete row from DB
      const deleteSql = "DELETE FROM subcategories WHERE id = ?";
      db.query(deleteSql, [id], (delErr, delRes) => {
        if (delErr) {
          console.error("DB Delete Error:", delErr);
          return res.status(500).json({ message: "Database error", error: delErr });
        }
        return res.status(200).json({ message: "Sub Category deleted successfully" });
      });
    });
  } catch (err) {
    console.error("Delete SubCategory Error:", err);
    return res.status(500).json({ message: "Server error", error: err });
  }
};

// Export upload middleware and controllers
export { upload };

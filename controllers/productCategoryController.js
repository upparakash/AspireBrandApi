import dotenv from "dotenv";
dotenv.config();

import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import db from "../db.js";
import path from "path";

const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_FOLDER = "AspireBrandStore/ProductCategories"; // Separate folder for categories
const REGION = process.env.AWS_REGION;

// Create S3 client
const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Multer S3 upload (no ACL)
const uploadCategory = multer({
  storage: multerS3({
    s3,
    bucket: S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const ext = path.extname(file.originalname) || "";
      const filename = `${S3_FOLDER}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, filename);
    },
  }),
});

// Extract S3 Key from URL
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

// ✅ ADD Product Category
export const addProductCategory = (req, res) => {
  try {
    const { productName, productCategory } = req.body;
    const file = req.file;

    if (!productName || !productCategory) {
      return res.status(400).json({ message: "Both productName and productCategory are required" });
    }

    if (!file || !file.location) {
      return res.status(400).json({ message: "Category image is required" });
    }

    const checkSql = "SELECT id FROM product_categories WHERE LOWER(productCategory) = LOWER(?)";
    db.query(checkSql, [productCategory.trim()], (checkErr, checkRes) => {
      if (checkErr) {
        console.error("DB Check Error:", checkErr);
        return res.status(500).json({ message: "Database error", error: checkErr });
      }

      if (checkRes.length > 0) {
        const uploadedKey = getS3KeyFromUrl(file.location);
        if (uploadedKey) {
          s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: uploadedKey }))
            .catch(() => {});
        }

        return res.status(400).json({ message: "productCategory already exists" });
      }

      const insertSql =
        "INSERT INTO product_categories (productName, productCategory, productCategoryImage) VALUES (?, ?, ?)";

      db.query(insertSql, [productName.trim(), productCategory.trim(), file.location], (insErr, insRes) => {
        if (insErr) {
          console.error("DB Insert Error:", insErr);
          return res.status(500).json({ message: "Database error", error: insErr });
        }

        return res.status(201).json({
          message: "Category added successfully",
          categoryId: insRes.insertId,
          categoryImage: file.location,
        });
      });
    });
  } catch (err) {
    console.error("Add Category Error:", err);
    return res.status(500).json({ message: "Server error", error: err });
  }
};

// ✅ GET All Categories
export const getProductCategories = (req, res) => {
  const sql = "SELECT id, productName, productCategory, productCategoryImage FROM product_categories ORDER BY id DESC";

  db.query(sql, (err, results) => {
    if (err) {
      console.error("DB Fetch Error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    return res.status(200).json(results);
  });
};

// ✅ UPDATE Category
export const updateProductCategory = (req, res) => {
  try {
    const { id } = req.params;
    const { productName, productCategory } = req.body;
    const file = req.file;

    if (!productName || !productCategory) {
      return res.status(400).json({ message: "Both productName and productCategory are required" });
    }

    const selectSql = "SELECT productCategoryImage FROM product_categories WHERE id = ?";
    db.query(selectSql, [id], (selErr, selRes) => {
      if (selErr) {
        console.error("DB Select Error:", selErr);
        return res.status(500).json({ message: "Database error", error: selErr });
      }

      if (selRes.length === 0) {
        if (file && file.location) {
          const newKey = getS3KeyFromUrl(file.location);
          if (newKey) s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: newKey })).catch(() => {});
        }

        return res.status(404).json({ message: "Category not found" });
      }

      const dupCheckSql =
        "SELECT id FROM product_categories WHERE LOWER(productCategory) = LOWER(?) AND id != ?";
      db.query(dupCheckSql, [productCategory.trim(), id], async (dupErr, dupRes) => {
        if (dupErr) {
          console.error("DB Duplicate Check Error:", dupErr);

          if (file && file.location) {
            const newKey = getS3KeyFromUrl(file.location);
            if (newKey) s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: newKey })).catch(() => {});
          }

          return res.status(500).json({ message: "Database error", error: dupErr });
        }

        if (dupRes.length > 0) {
          if (file && file.location) {
            const newKey = getS3KeyFromUrl(file.location);
            if (newKey) s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: newKey })).catch(() => {});
          }

          return res.status(400).json({ message: "productCategory already exists" });
        }

        const oldImageUrl = selRes[0].productCategoryImage;
        let newImageUrl = oldImageUrl;

        if (file && file.location) {
          newImageUrl = file.location;

          const oldKey = getS3KeyFromUrl(oldImageUrl);
          if (oldKey) {
            try {
              await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: oldKey }));
            } catch {}
          }
        }

        const updateSql =
          "UPDATE product_categories SET productName = ?, productCategory = ?, productCategoryImage = ? WHERE id = ?";

        db.query(updateSql, [productName.trim(), productCategory.trim(), newImageUrl, id], (updErr) => {
          if (updErr) {
            console.error("DB Update Error:", updErr);
            return res.status(500).json({ message: "Database error", error: updErr });
          }

          return res.status(200).json({ message: "Category updated successfully" });
        });
      });
    });
  } catch (err) {
    console.error("Update Category Error:", err);
    return res.status(500).json({ message: "Server error", error: err });
  }
};

// ✅ DELETE Category
export const deleteProductCategory = (req, res) => {
  try {
    const { id } = req.params;

    const selectSql = "SELECT productCategoryImage FROM product_categories WHERE id = ?";
    db.query(selectSql, [id], async (selErr, selRes) => {
      if (selErr) {
        console.error("DB Select Error:", selErr);
        return res.status(500).json({ message: "Database error", error: selErr });
      }

      if (selRes.length === 0) {
        return res.status(404).json({ message: "Category not found" });
      }

      const imageUrl = selRes[0].productCategoryImage;
      const key = getS3KeyFromUrl(imageUrl);

      if (key) {
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
        } catch {}
      }

      const deleteSql = "DELETE FROM product_categories WHERE id = ?";
      db.query(deleteSql, [id], (delErr) => {
        if (delErr) {
          console.error("DB Delete Error:", delErr);
          return res.status(500).json({ message: "Database error", error: delErr });
        }

        return res.status(200).json({ message: "Category deleted successfully" });
      });
    });
  } catch (err) {
    console.error("Delete Category Error:", err);
    return res.status(500).json({ message: "Server error", error: err });
  }
};

export { uploadCategory };

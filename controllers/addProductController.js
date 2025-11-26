// controllers/addProductController.js
import dotenv from "dotenv";
dotenv.config();
import { io } from "../server.js";
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import db from "../db.js"; // your mysql connection
import path from "path";

const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_FOLDER = "AspireBrandStore"; // as you requested
const REGION = process.env.AWS_REGION;

// Create S3 client
const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Multer-S3 storage (NO acl)
const upload = multer({
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

// Helper: extract S3 object key from S3 URL
// Handles patterns like:
// https://bucket.s3.region.amazonaws.com/AspireBrandStore/xxx.jpg
// or https://s3.region.amazonaws.com/bucket/AspireBrandStore/xxx.jpg
function getS3KeyFromUrl(url) {
  if (!url) return null;
  // Try split by .amazonaws.com/
  const marker = ".amazonaws.com/";
  if (url.includes(marker)) {
    return url.split(marker)[1];
  }
  // fallback: try after bucket name
  try {
    const u = new URL(url);
    // pathname contains /AspireBrandStore/xxx.jpg or /bucket/AspireBrandStore/xxx.jpg
    let pathname = u.pathname;
    if (pathname.startsWith("/")) pathname = pathname.slice(1);
    // If bucket-name is part of pathname (rare), remove first segment if it equals bucket
    const parts = pathname.split("/");
    if (parts[0] === S3_BUCKET) parts.shift();
    return parts.join("/");
  } catch (e) {
    return null;
  }
}

// ----------------- CONTROLLERS -----------------

// ADD Product (single image required)
export const addProduct = (req, res) => {
  try {
    // Debug logs (remove in prod if desired)
    // console.log("Body:", req.body);
    // console.log("File:", req.file);

    const { productName } = req.body;
    const file = req.file;

    if (!productName || productName.trim() === "") {
      return res.status(400).json({ message: "Product name is required" });
    }

    if (!file || !file.location) {
      return res.status(400).json({ message: "Product image is required" });
    }

    // Normalize product name uniqueness (case-insensitive)
    const checkSql = "SELECT id FROM products WHERE LOWER(productName) = LOWER(?)";
    db.query(checkSql, [productName.trim()], (checkErr, checkRes) => {
      if (checkErr) {
        console.error("DB Check Error:", checkErr);
        return res.status(500).json({ message: "Database error", error: checkErr });
      }

      if (checkRes.length > 0) {
        // Optionally: delete uploaded file from S3 because product not created
        // We'll try to delete uploaded file to avoid orphan objects
        const uploadedKey = getS3KeyFromUrl(file.location);
        if (uploadedKey) {
          s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: uploadedKey }))
            .catch((e) => console.warn("Failed to remove orphan upload:", e));
        }

        return res.status(400).json({ message: "Product name already exists" });
      }

      const insertSql = "INSERT INTO products (productName, productImage) VALUES (?, ?)";
      db.query(insertSql, [productName.trim(), file.location], (insErr, insRes) => {
        if (insErr) {
          console.error("DB Insert Error:", insErr);
          return res.status(500).json({ message: "Database error", error: insErr });
        }

        return res.status(201).json({
          message: "Product added successfully",
          productId: insRes.insertId,
          productImage: file.location,
        });
      });
    });
  } catch (err) {
    console.error("Add Product Error:", err);
    return res.status(500).json({ message: "Server error", error: err });
  }
};

// GET All Products
export const getProducts = (req, res) => {
  const sql = "SELECT id, productName, productImage FROM products ORDER BY id DESC";
  db.query(sql, (err, results) => {
    if (err) {
      console.error("DB Fetch Error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }
    // results is an array of rows
    return res.status(200).json(results);
  });
};

// UPDATE Product (replace image if new file provided; old image deleted from S3)
export const updateProduct = (req, res) => {
  try {
    const { id } = req.params;
    const { productName } = req.body;
    const file = req.file; // might be undefined when user doesn't upload a new image

    if (!productName || productName.trim() === "") {
      return res.status(400).json({ message: "Product name is required" });
    }

    // Check product exists
    const checkProductSql = "SELECT productImage FROM products WHERE id = ?";
    db.query(checkProductSql, [id], (checkErr, productRes) => {
      if (checkErr) {
        console.error("DB Check Error:", checkErr);
        return res.status(500).json({ message: "Database error", error: checkErr });
      }

      if (productRes.length === 0) {
        // If a new file was uploaded, clean it up
        if (file && file.location) {
          const key = getS3KeyFromUrl(file.location);
          if (key) {
            s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }))
              .catch(() => {});
          }
        }
        return res.status(404).json({ message: "Product not found" });
      }

      // Check duplicate name (exclude current id)
      const dupCheckSql = "SELECT id FROM products WHERE LOWER(productName) = LOWER(?) AND id != ?";
      db.query(dupCheckSql, [productName.trim(), id], async (dupErr, dupRes) => {
        if (dupErr) {
          console.error("DB Duplicate Check Error:", dupErr);
          // cleanup uploaded file if exists
          if (file && file.location) {
            const key = getS3KeyFromUrl(file.location);
            if (key) s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key })).catch(()=>{});
          }
          return res.status(500).json({ message: "Database error", error: dupErr });
        }

        if (dupRes.length > 0) {
          if (file && file.location) {
            const key = getS3KeyFromUrl(file.location);
            if (key) s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key })).catch(()=>{});
          }
          return res.status(400).json({ message: "Product name already exists" });
        }

        const oldImageUrl = productRes[0].productImage;
        let newImageUrl = oldImageUrl;

        // If a new file is provided -> delete old S3 object (if exists) and set new URL
        if (file && file.location) {
          newImageUrl = file.location;

          // delete old image from S3 (best-effort)
          const oldKey = getS3KeyFromUrl(oldImageUrl);
          if (oldKey) {
            try {
              await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: oldKey }));
              // console.log("Deleted old image from S3:", oldKey);
            } catch (delErr) {
              console.warn("Failed to delete old S3 object:", delErr);
              // continue anyway
            }
          }
        }

        // Update DB
        const updateSql = "UPDATE products SET productName = ?, productImage = ? WHERE id = ?";
        db.query(updateSql, [productName.trim(), newImageUrl, id], (updErr) => {
          if (updErr) {
            console.error("DB Update Error:", updErr);
            return res.status(500).json({ message: "Database error", error: updErr });
          }
          return res.status(200).json({ message: "Product updated successfully" });
        });
      });
    });
  } catch (err) {
    console.error("Update Product Error:", err);
    return res.status(500).json({ message: "Server error", error: err });
  }
};

// DELETE Product (delete image from S3 then DB)
export const deleteProduct = (req, res) => {
  try {
    const { id } = req.params;

    const selectSql = "SELECT productImage FROM products WHERE id = ?";
    db.query(selectSql, [id], async (selErr, selRes) => {
      if (selErr) {
        console.error("DB Select Error:", selErr);
        return res.status(500).json({ message: "Database error", error: selErr });
      }

      if (selRes.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }

      const imageUrl = selRes[0].productImage;
      const key = getS3KeyFromUrl(imageUrl);

      if (key) {
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
          // console.log("Deleted image from S3:", key);
        } catch (s3DelErr) {
          console.warn("S3 Delete Error:", s3DelErr);
          // proceed to delete DB row anyway
        }
      }

      const deleteSql = "DELETE FROM products WHERE id = ?";
      db.query(deleteSql, [id], (delErr, delRes) => {
        if (delErr) {
          console.error("DB Delete Error:", delErr);
          return res.status(500).json({ message: "Database error", error: delErr });
        }

        return res.status(200).json({ message: "Product deleted successfully" });
      });
    });
  } catch (err) {
    console.error("Delete Product Error:", err);
    return res.status(500).json({ message: "Server error", error: err });
  }
};

// Export upload and controllers
export { upload };

// controllers/addSubCategoryController.js
import dotenv from "dotenv";
dotenv.config();

import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import db from "../db.js";
import path from "path";

// ⚡ Import Socket.IO instance from server.js
import { io } from "../server.js";

// AWS S3 Config
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_FOLDER = "AspireBrandStore";
const REGION = process.env.AWS_REGION;

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Multer Upload Configuration
const s3Storage = multerS3({
  s3,
  bucket: S3_BUCKET,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: function (req, file, cb) {
    const ext = path.extname(file.originalname) || "";
    const filename = `${S3_FOLDER}/${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${ext}`;
    cb(null, filename);
  },
});

const uploadS3 = multer({ storage: s3Storage });
// ✅ CKEditor single image upload middleware
export const uploadEditor = uploadS3.single("upload");

// Middleware for 4 images
export const upload = uploadS3.fields([
  { name: "image_1", maxCount: 1 },
  { name: "image_2", maxCount: 1 },
  { name: "image_3", maxCount: 1 },
  { name: "image_4", maxCount: 1 },
]);

// Extract key from S3 URL
function getS3KeyFromUrl(url) {
  if (!url) return null;
  const marker = ".amazonaws.com/";
  if (url.includes(marker)) return url.split(marker)[1];

  try {
    const u = new URL(url);
    let pathname = u.pathname.replace(/^\//, "");
    const parts = pathname.split("/");
    if (parts[0] === S3_BUCKET) parts.shift();
    return parts.join("/");
  } catch {
    return null;
  }
}

// Delete S3 file
async function deleteS3Object(key) {
  if (!key) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  } catch (err) {
    console.warn("S3 Delete Error:", key, err);
  }
}

// ------------------------------------------------------
// 🟢 ADD SUB CATEGORY (POST)
// ------------------------------------------------------
export const addSubCategory = (req, res) => {
  try {
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

    // Validate required fields
    if (!productCategory || !subCategaryname || !price || !sku) {
      return res.status(400).json({
        message: "Product Category, Sub Category, Price and SKU are required",
      });
    }

    // Check 4 images
    const filesPresent =
      req.files?.image_1?.[0] &&
      req.files?.image_2?.[0] &&
      req.files?.image_3?.[0] &&
      req.files?.image_4?.[0];

    if (!filesPresent) {
      return res
        .status(400)
        .json({ message: "All 4 images are required (image_1..image_4)" });
    }

    const image_1 = req.files.image_1[0].location;
    const image_2 = req.files.image_2[0].location;
    const image_3 = req.files.image_3[0].location;
    const image_4 = req.files.image_4[0].location;

    // Check for duplicate SKU
    const checkSql = "SELECT id FROM subcategories WHERE LOWER(sku) = LOWER(?)";

    db.query(checkSql, [sku], (checkErr, skuRes) => {
      if (checkErr) return res.status(500).json({ message: "DB error", checkErr });

      if (skuRes.length > 0) {
        return res.status(400).json({ message: "SKU already exists" });
      }

      // Insert
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
          if (err) return res.status(500).json({ message: "DB error", err });

          // 🔥 Emit socket event
          io.emit("subCategoryAdded", {
            id: result.insertId,
            productCategory,
            subCategaryname,
            price,
            sku,
          });

          return res.status(201).json({
            message: "Sub Category added successfully",
            id: result.insertId,
          });
        }
      );
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", err });
  }
};

// ------------------------------------------------------
// 🟡 GET ALL SUB CATEGORIES
// ------------------------------------------------------
export const getSubCategories = (req, res) => {
  const sql = "SELECT * FROM subcategories ORDER BY id DESC";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: "DB error" });
    res.status(200).json(results);
  });
};

// ------------------------------------------------------
// 🟠 UPDATE SUB CATEGORY
// ------------------------------------------------------
export const updateSubCategory = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("🔹 Update Request for SubCategory ID:", id);
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
    console.log("🔹 Request body:", req.body);

    const imageFiles = {
      image_1: req.files?.image_1?.[0],
      image_2: req.files?.image_2?.[0],
      image_3: req.files?.image_3?.[0],
      image_4: req.files?.image_4?.[0],
    };
    console.log("🔹 Uploaded images:", imageFiles);

    // 1️⃣ Fetch existing subcategory
    db.query("SELECT * FROM subcategories WHERE id = ?", [id], async (err, rows) => {
      if (err) {
        console.error("❌ DB SELECT Error:", err);
        return res.status(500).json({ message: "DB error", err });
      }
      if (rows.length === 0) {
        console.warn("⚠️ SubCategory not found for ID:", id);
        return res.status(404).json({ message: "Sub Category not found" });
      }

      const existing = rows[0];
      console.log("🔹 Existing SubCategory Data:", existing);

      let updateFields = [];
      let params = [];

      // 2️⃣ Prepare field updates
      const fieldsToUpdate = { productCategory, subCategaryname, price, material, sku, brand, description, gender };
      for (const [key, value] of Object.entries(fieldsToUpdate)) {
        if (value !== undefined && value !== null && value !== "") {
          console.log(`🔹 Field to update: ${key} = ${value}`);
          updateFields.push(`${key} = ?`);
          params.push(value);
        }
      }

      // 3️⃣ Handle image updates
      for (const [field, file] of Object.entries(imageFiles)) {
        if (file) {
          console.log(`🔹 Updating image field: ${field}`);
          const newUrl = file.location; // multer-s3 file URL
          const oldKey = getS3KeyFromUrl(existing[field]);
          console.log(`🔹 Old S3 key: ${oldKey}`);
          if (oldKey) {
            await deleteS3Object(oldKey);
            console.log(`✅ Deleted old S3 object: ${oldKey}`);
          }
          updateFields.push(`${field} = ?`);
          params.push(newUrl);
        }
      }

      if (updateFields.length === 0) {
        console.warn("⚠️ Nothing to update");
        return res.status(400).json({ message: "Nothing to update" });
      }

      // 4️⃣ Execute DB update
      const sql = `UPDATE subcategories SET ${updateFields.join(", ")} WHERE id = ?`;
      params.push(id);
      console.log("🔹 SQL Update:", sql, "Params:", params);

      db.query(sql, params, (updateErr) => {
        if (updateErr) {
          console.error("❌ DB UPDATE Error:", updateErr);
          return res.status(500).json({ message: "DB error", err: updateErr });
        }
        console.log("✅ SubCategory updated in DB");

        // 5️⃣ Fetch updated row
        db.query("SELECT * FROM subcategories WHERE id = ?", [id], (fetchErr, updatedRows) => {
          if (fetchErr || updatedRows.length === 0) {
            console.error("❌ Fetch updated row failed:", fetchErr);
            return res.status(200).json({ message: "Sub Category updated, but fetch failed" });
          }

          const updatedRow = updatedRows[0];
          console.log("🔹 Fetched Updated Row:", updatedRow);

          // 6️⃣ Emit single socket event with full data
          console.log("🔹 Emitting socket event: subCategoryUpdated");
          io.emit("subCategoryUpdated", updatedRow);

          // 7️⃣ Respond to client
          return res.status(200).json({
            message: "Sub Category updated successfully",
            updated: updatedRow,
          });
        });
      });
    });
  } catch (err) {
    console.error("❌ Update SubCategory Error:", err);
    return res.status(500).json({ message: "Server error", err });
  }
};


// ------------------------------------------------------
// 🔴 DELETE SUB CATEGORY
// ------------------------------------------------------
export const deleteSubCategory = (req, res) => {
  try {
    const { id } = req.params;

    db.query(
      "SELECT * FROM subcategories WHERE id = ?",
      [id],
      async (err, rows) => {
        if (err) return res.status(500).json({ message: "DB error" });
        if (rows.length === 0)
          return res.status(404).json({ message: "Not found" });

        const r = rows[0];

        // Delete S3 images
        const keys = [
          getS3KeyFromUrl(r.image_1),
          getS3KeyFromUrl(r.image_2),
          getS3KeyFromUrl(r.image_3),
          getS3KeyFromUrl(r.image_4),
        ];
        await Promise.all(keys.map((k) => deleteS3Object(k)));

        // Delete DB row
        db.query(
          "DELETE FROM subcategories WHERE id = ?",
          [id],
          (delErr) => {
            if (delErr)
              return res.status(500).json({ message: "DB error", delErr });

            // 🔥 Socket Emit
            io.emit("subCategoryDeleted", id);

            res.status(200).json({
              message: "Sub Category deleted successfully",
            });
          }
        );
      }
    );
  } catch (err) {
    return res.status(500).json({ message: "Server error", err });
  }
};




export const uploadEditorImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded" });
    }

   return res.status(200).json({
  default: req.file.location, // ✅ REQUIRED
});
  } catch (error) {
    console.error("CKEditor Upload Error:", error);
    return res.status(500).json({ message: "Upload failed" });
  }
};

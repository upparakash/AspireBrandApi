import dotenv from "dotenv";
dotenv.config();

import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import db from "../db.js";
import path from "path";

const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_FOLDER = "AspireBrandBanner";
const REGION = process.env.AWS_REGION;

// ----------------- S3 CLIENT -----------------
const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ----------------- MULTER-S3 UPLOAD -----------------
const upload = multer({
  storage: multerS3({
    s3,
    bucket: S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const ext = path.extname(file.originalname) || "";
      const fileName = `${S3_FOLDER}/${Date.now()}-${Math.random()}${ext}`;
      cb(null, fileName);
    },
  }),
});

// Extract S3 key
function getS3KeyFromUrl(url) {
  if (!url) return null;
  const marker = ".amazonaws.com/";
  if (url.includes(marker)) {
    return url.split(marker)[1];
  }
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, "");
  } catch {
    return null;
  }
}

/* ===========================================================
   ADD BANNER
=========================================================== */
export const addBanner = (req, res) => {
  try {
    const { title, project, platform } = req.body;
    const file = req.file;

    if (!title?.trim()) {
      return res.status(400).json({ message: "Banner title is required" });
    }
    if (!project) {
      return res.status(400).json({ message: "Project is required" });
    }
    if (!platform) {
      return res.status(400).json({ message: "Platform is required" });
    }
    if (!file?.location) {
      return res.status(400).json({ message: "Banner image is required" });
    }

    const sql = `
      INSERT INTO banners (title, project, platform, bannerImage)
      VALUES (?, ?, ?, ?)
    `;

    db.query(
      sql,
      [title.trim(), project, platform, file.location],
      (err, result) => {
        if (err) {
          console.error("DB Insert Error:", err);
          return res.status(500).json({ message: "Database error", error: err });
        }

        res.status(201).json({
          message: "Banner added successfully",
          id: result.insertId,
          bannerImage: file.location,
        });
      }
    );
  } catch (err) {
    console.error("Add Banner Error:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
};

/* ===========================================================
   GET ALL BANNERS
=========================================================== */
export const getBanners = (req, res) => {
  const sql = "SELECT * FROM banners ORDER BY id DESC";
  db.query(sql, (err, results) => {
    if (err) {
      console.error("Fetch Error:", err);
      return res.status(500).json({ message: "Database error", error: err });
    }

    res.status(200).json(results);
  });
};

/* ===========================================================
   UPDATE BANNER
=========================================================== */
export const updateBanner = (req, res) => {
  try {
    const { id } = req.params;
    const { title, project, platform } = req.body;
    const file = req.file;

    if (!title?.trim()) {
      return res.status(400).json({ message: "Banner title is required" });
    }
    if (!project) {
      return res.status(400).json({ message: "Project is required" });
    }
    if (!platform) {
      return res.status(400).json({ message: "Platform is required" });
    }

    const selectSql = "SELECT bannerImage FROM banners WHERE id = ?";
    db.query(selectSql, [id], async (err, rows) => {
      if (err) {
        console.error("Select Error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (rows.length === 0) {
        return res.status(404).json({ message: "Banner not found" });
      }

      let oldImage = rows[0].bannerImage;
      let newImage = oldImage;

      // Upload new image and remove old one
      if (file?.location) {
        newImage = file.location;

        const oldKey = getS3KeyFromUrl(oldImage);

        if (oldKey) {
          try {
            await s3.send(
              new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: oldKey })
            );
          } catch (e) {
            console.warn("Old S3 Delete Failed:", e);
          }
        }
      }

      const updateSql = `
        UPDATE banners 
        SET title = ?, project = ?, platform = ?, bannerImage = ? 
        WHERE id = ?
      `;

      db.query(
        updateSql,
        [title.trim(), project, platform, newImage, id],
        (updErr) => {
          if (updErr) {
            console.error("Update Error:", updErr);
            return res.status(500).json({ message: "Database error", error: updErr });
          }

          res.status(200).json({ message: "Banner updated successfully" });
        }
      );
    });
  } catch (err) {
    console.error("Update Banner Error:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
};

/* ===========================================================
   DELETE BANNER
=========================================================== */
export const deleteBanner = (req, res) => {
  try {
    const { id } = req.params;

    const selectSql = "SELECT bannerImage FROM banners WHERE id = ?";
    db.query(selectSql, [id], async (err, rows) => {
      if (err) {
        console.error("Select Error:", err);
        return res.status(500).json({ message: "Database error", error: err });
      }

      if (rows.length === 0) {
        return res.status(404).json({ message: "Banner not found" });
      }

      const imageUrl = rows[0].bannerImage;
      const key = getS3KeyFromUrl(imageUrl);

      if (key) {
        try {
          await s3.send(
            new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key })
          );
        } catch (e) {
          console.warn("Failed to delete image from S3:", e);
        }
      }

      const deleteSql = "DELETE FROM banners WHERE id = ?";
      db.query(deleteSql, [id], (delErr) => {
        if (delErr) {
          console.error("Delete Error:", delErr);
          return res.status(500).json({ message: "Database error", error: delErr });
        }

        res.status(200).json({ message: "Banner deleted successfully" });
      });
    });
  } catch (err) {
    console.error("Delete Banner Error:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
};

export { upload };

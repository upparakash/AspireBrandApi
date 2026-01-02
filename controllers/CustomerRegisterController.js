import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import multerS3 from "multer-s3";
import path from "path";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import db from "../db.js"; // your MySQL connection
dotenv.config();

// -------------------- ⚙️ AWS CONFIG --------------------
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const S3_FOLDER = "AspireBrandStore/CustomerRegisterProfile";
const REGION = process.env.AWS_REGION;

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// -------------------- 📸 MULTER S3 UPLOAD --------------------
export const uploadCategory = multer({
  storage: multerS3({
    s3,
    bucket: S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const ext = path.extname(file.originalname) || "";
      const fileName = `${S3_FOLDER}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, fileName);
    },
  }),
});

// -------------------- 🧠 Helper Function --------------------
function getS3KeyFromUrl(url) {
  if (!url) return null;
  const marker = ".amazonaws.com/";
  if (url.includes(marker)) return url.split(marker)[1];
  try {
    const u = new URL(url);
    let pathname = u.pathname;
    if (pathname.startsWith("/")) pathname = pathname.slice(1);
    const parts = pathname.split("/");
    if (parts[0] === S3_BUCKET) parts.shift();
    return parts.join("/");
  } catch {
    return null;
  }
}

// -------------------- 👤 REGISTER --------------------
export const registerUser = (req, res) => {
  const { fullName, email, phone, password } = req.body;
  const profileUrl = req.file?.location || null;

  if (!fullName || !email || !phone || !password) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  const sql = `INSERT INTO customers (fullName, email, phone, password, profile) 
               VALUES (?, ?, ?, ?, ?)`;

  db.query(sql, [fullName, email, phone, hashedPassword, profileUrl], (err, result) => {

    if (err) {
      console.error("❌ Register error:", err);

      // 🔥 CHECK FOR DUPLICATE ENTRY ERROR
      if (err.code === "ER_DUP_ENTRY") {
        if (err.sqlMessage.includes("email")) {
          return res.status(409).json({
            success: false,
            message: "Email already exists",
          });
        }
        if (err.sqlMessage.includes("phone")) {
          return res.status(409).json({
            success: false,
            message: "Phone number already exists",
          });
        }
      }

      // Other DB errors
      return res.status(500).json({
        success: false,
        message: "Database error",
      });
    }

    console.log("✅ User Registered:", result.insertId);

    return res.json({
      success: true,
      message: "User registered successfully",
    });
  });
};


// -------------------- 🔐 LOGIN --------------------
export const loginUser = (req, res) => {
  const { email, password } = req.body;
  console.log("🔐 Login Attempt:", email);

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password required" });
  }

  db.query(`SELECT * FROM customers WHERE email = ?`, [email], (err, results) => {
    if (err) {
      console.error("❌ Login error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (results.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const user = results[0];
    const isMatch = bcrypt.compareSync(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        profile: user.profile,
      },
    });
  });
};

// -------------------- 👀 GET PROFILE --------------------
export const getUserProfile = (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

  const sql = `SELECT id, fullName, email, phone, profile, created_at FROM customers WHERE id = ?`;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("❌ Profile fetch error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, data: results[0] });
  });
};

// -------------------- ✏️ UPDATE PROFILE --------------------
export const updateUserProfile = (req, res) => {
  const userId = req.user?.id;
  const { fullName, email, phone } = req.body;
  const newProfileUrl = req.file?.location;

  console.log(" User ID from token:", userId);
  console.log(" Update Body:", req.body);
  console.log(" Uploaded New File:", req.file);

  // CRITICAL CHECK
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Invalid or missing token user",
    });
  }

  //  Fetch old profile
  db.query(
    "SELECT profile FROM customers WHERE id = ?",
    [userId],
    async (err, results) => {
      if (err) {
        console.error("❌ Fetch old profile error:", err);
        return res
          .status(500)
          .json({ success: false, message: "Error fetching old profile" });
      }

      if (results.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const oldProfileUrl = results[0].profile;
      const oldS3Key = getS3KeyFromUrl(oldProfileUrl);

      // 2 Delete old S3 file if new one uploaded
      if (newProfileUrl && oldS3Key) {
        try {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: S3_BUCKET,
              Key: oldS3Key,
            })
          );
          console.log("🗑️ Old profile image deleted from S3");
        } catch (deleteErr) {
          console.error("⚠️ Failed to delete old image:", deleteErr);
        }
      }

      //  Update user record
      const updateSql = `
        UPDATE customers
        SET fullName = ?, email = ?, phone = ?, profile = COALESCE(?, profile)
        WHERE id = ?
      `;

      db.query(
        updateSql,
        [fullName, email, phone, newProfileUrl, userId],
        (updateErr, result) => {
         if (updateErr) {
  console.error("❌ Update error:", updateErr);

  // ✅ DUPLICATE ENTRY HANDLING
  if (updateErr.code === "ER_DUP_ENTRY") {
    if (updateErr.sqlMessage.includes("customers.phone")) {
      return res.status(409).json({
        success: false,
        errorType: "DUPLICATE_PHONE",
        message: "Phone number already exists",
      });
    }

    if (updateErr.sqlMessage.includes("customers.email")) {
      return res.status(409).json({
        success: false,
        errorType: "DUPLICATE_EMAIL",
        message: "Email already exists",
      });
    }
  }

  return res.status(500).json({
    success: false,
    message: "Error updating profile",
  });
}


          // 🔥 MOST IMPORTANT CHECK
          if (result.affectedRows === 0) {
            return res.status(400).json({
              success: false,
              message: "Profile not updated (no changes or invalid user)",
            });
          }

          res.json({
            success: true,
            message: "Profile updated successfully",
          });
        }
      );
    }
  );
};

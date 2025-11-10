import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import addProductRoutes from "./routes/addProductRoutes.js";
import productCategoryRoutes from "./routes/productCategoryRoutes.js";
import addSubCategoryRoutes from "./routes/addSubCategoryRoutes.js";
import path from "path";
dotenv.config();
const app = express();

// app.use(cors());
// ✅ CORS Setup for React App
app.use(
  cors({
    origin: "http://localhost:5173", // Your React URL
    credentials: true,
  })
);
app.use(express.json());
// Serve uploaded images
app.use("/uploads", express.static(path.join("uploads")));
// Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", addProductRoutes);
app.use("/api/productCategories", productCategoryRoutes);
app.use("/api/subcategories", addSubCategoryRoutes);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

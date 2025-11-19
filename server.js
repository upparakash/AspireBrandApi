import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";

import authRoutes from "./routes/authRoutes.js";
import addProductRoutes from "./routes/addProductRoutes.js";
import productCategoryRoutes from "./routes/productCategoryRoutes.js";
import addSubCategoryRoutes from "./routes/addSubCategoryRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import customerRegisterRoutes from "./routes/CustomerRegisterRouter.js"; // ✅ renamed for consistency

dotenv.config();

const app = express();

// ✅ Enable CORS (for React + React Native)
app.use(
  cors({
    origin: ["http://localhost:5173", "http://10.0.2.2:5173"], // React web + Android emulator
    credentials: true,
  })
);

// ✅ JSON parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// ✅ Serve static uploads (if any local storage is used)
app.use("/uploads", express.static(path.join("uploads")));

// ✅ Main Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", addProductRoutes);
app.use("/api/productCategories", productCategoryRoutes);
app.use("/api/subcategories", addSubCategoryRoutes);
app.use("/api/orders", orderRoutes);

// ✅ Customer Register/Login/Profile routes (S3 upload + JWT)
app.use("/api/customers", customerRegisterRoutes); // ⚡ updated path

// ✅ Default Port
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

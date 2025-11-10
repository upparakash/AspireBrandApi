import express from "express";
import {
  addProductCategory,
  getProductCategories,
  updateProductCategory,
  deleteProductCategory,
  uploadCategory,
} from "../controllers/productCategoryController.js";

const router = express.Router();

// Routes
router.post("/", uploadCategory.single("productCategoryImage"), addProductCategory);
router.get("/", getProductCategories);
router.put("/:id", uploadCategory.single("productCategoryImage"), updateProductCategory);
router.delete("/:id", deleteProductCategory);

export default router;

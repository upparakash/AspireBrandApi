// routes/subcategoryRoutes.js
import express from "express";
import { upload, addSubCategory, getSubCategories, updateSubCategory, deleteSubCategory } from "../controllers/addSubCategoryController.js";

const router = express.Router();

// routes/subcategoryRoutes.js
router.post("/", upload, addSubCategory);
router.get("/", getSubCategories);
router.put("/:id", upload, updateSubCategory);
router.delete("/:id", deleteSubCategory);
export default router;

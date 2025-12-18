// routes/subcategoryRoutes.js
import express from "express";
import {
  upload, 
    
  addSubCategory,
  getSubCategories,
  updateSubCategory,
  deleteSubCategory,
  uploadEditorImage, // ✅ ADD THIS
} from "../controllers/addSubCategoryController.js";

import { uploadEditor }  from "../middleware/uploadEditor.js";


const router = express.Router();

// Subcategory CRUD
router.post("/", upload, addSubCategory);
router.get("/", getSubCategories);
router.put("/:id", upload, updateSubCategory);
router.delete("/:id", deleteSubCategory);

// ✅ CKEditor image upload route

router.post("/upload-image", uploadEditor, uploadEditorImage);

export default router;




import express from "express";
import { addProduct,
  getProducts,
  updateProduct,
  deleteProduct,
  upload, } from "../controllers/addProductController.js";

const router = express.Router();

// Route: POST /api/addproduct
// router.post("/addproduct", upload.single("productImage"), addProduct);
// Routes
router.post("/", upload.single("productImage"), addProduct);
router.get("/", getProducts);
router.put("/:id", upload.single("productImage"), updateProduct);
router.delete("/:id", deleteProduct);

export default router;

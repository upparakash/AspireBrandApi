
import express from "express";
import { getStocks, getCategories, updateStock, getStockById } from "../controllers/StockController.js";

const router = express.Router();

router.get("/getStocks", getStocks);
router.get("/categories", getCategories);
router.post("/updateStock", updateStock);
router.get("/getStockById", getStockById);

export default router;

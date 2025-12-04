const express = require("express");
const router = express.Router();
const stock = require("../controllers/StockController");

router.get("/getStocks", stock.getStocks);
router.get("/categories", stock.getCategories);
router.post("/updateStock", stock.updateStock);
router.get("/getStockById", stock.getStockById );
module.exports = router;
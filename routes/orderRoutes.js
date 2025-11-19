// routes/orderRoutes.js
import express from "express";
import {
  placeOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
} from "../controllers/orderController.js";

const router = express.Router();

router.post("/add", placeOrder);              // create order
router.get("/", getAllOrders);                // list orders, optional ?phone=...
router.get("/:id", getOrderById);            // get one order by id (with items)
router.put("/:id/status", updateOrderStatus); // update order status

export default router;

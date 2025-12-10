// routes/orderRoutes.js
import express from "express";
import {
  placeOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  updateItemStatus,
 
} from "../controllers/orderController.js";

const router = express.Router();

router.post("/add", placeOrder);              // create order
router.get("/", getAllOrders);                // list orders, optional ?phone=...
router.get("/:id", getOrderById);            // get one order by id (with items)
router.put("/:id/status", updateOrderStatus); // update order status
router.put("/:orderId/items/:itemId/status", updateItemStatus);

export default router;

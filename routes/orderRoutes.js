// routes/orderRoutes.js
import express from "express";
import {
  placeOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  updateItemStatus,
  getMyOrders,
 
} from "../controllers/orderController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
const router = express.Router();

router.post("/add", verifyToken, placeOrder);             // create order
router.get("/", getAllOrders);                // list orders, optional ?phone=...
router.put("/:id/status", updateOrderStatus); // update order status
router.put("/:orderId/items/:itemId/status", updateItemStatus);
router.get("/my-orders", verifyToken, getMyOrders);
router.get("/:id", getOrderById); // get one order by id (with items)

export default router;

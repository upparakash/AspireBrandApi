import express from "express";
import {
  createRazorpayOrder,
  verifyRazorpayPayment,
  updatePaymentStatus,
} from "../controllers/paymentController.js";

const router = express.Router();

router.post("/create-order", createRazorpayOrder);
router.post("/verify", verifyRazorpayPayment);
router.post("/update-payment", updatePaymentStatus);

export default router;

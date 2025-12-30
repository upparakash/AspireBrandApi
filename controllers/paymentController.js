import Razorpay from "razorpay";
import crypto from "crypto";
import db from "../db.js";
console.log("KEY ID:", process.env.RAZORPAY_KEY_ID);
console.log("KEY SECRET:", process.env.RAZORPAY_KEY_SECRET);
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

//  Create Razorpay Order
export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ success: false, message: "Amount required" });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    });

   res.json({
  success: true,
  orderId: order.id,
});
  } catch (error) {
    console.error("Razorpay Order Error:", error);
    res.status(500).json({ success: false, message: "Order creation failed" });
  }
};

//  Verify Razorpay Payment
export const verifyRazorpayPayment = (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Verification failed" });
  }
};

// Update Payment Status (AFTER verification)
export const updatePaymentStatus = (req, res) => {
  const { orderId, paymentId } = req.body;

  if (!orderId || !paymentId) {
    return res.status(400).json({ success: false, message: "Missing data" });
  }

  db.query(
    `UPDATE orders 
     SET paymentStatus='PAID', razorpayPaymentId=? 
     WHERE id=?`,
    [paymentId, orderId],
    (err) => {
      if (err) {
        console.error("DB Error:", err);
        return res.status(500).json({ success: false, message: "DB error" });
      }
      res.json({ success: true });
    }
  );
};

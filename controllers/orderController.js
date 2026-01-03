// controllers/orderController.js
import db from "../db.js";

// Helper: group items by orderId (unchanged)
function groupItemsByOrder(rows) {
  return rows.reduce((acc, r) => {
    const oid = r.orderId;
    if (!acc[oid]) acc[oid] = { items: [], order: null };
    acc[oid].items.push({
      id: r.id,
      productId: r.productId,
      productName: r.productName,
      price: r.price,
      quantity: r.quantity,
      imageUrl: r.imageUrl,
      itemStatus: r.itemStatus,   // ✅ Added
    });
    return acc;
  }, {});
}

// -----------------------------
// PLACE ORDER
// -----------------------------
export const placeOrder = (req, res) => {
  try {
    // 🔍 AUTH DEBUG
    console.log("===== PLACE ORDER START =====");
    console.log("Authorization Header:", req.headers.authorization);
    console.log("Decoded User (req.user):", req.user);

    const userId = req.user?.id || null;
    console.log("User ID extracted:", userId);

    const {
      fullName,
      phone,
      address,
      city,
      pincode,
      items,
      totalAmount,
      paymentMethod = "COD",
      paymentStatus = "PENDING",
      razorpayOrderId = null,
      razorpayPaymentId = null,
    } = req.body;

    // 🔍 BODY DEBUG
    console.log("Order Request Body:", {
      fullName,
      phone,
      address,
      city,
      pincode,
      totalAmount,
      paymentMethod,
      itemsCount: items?.length,
    });

    if (
      !fullName ||
      !phone ||
      !address ||
      !city ||
      !pincode ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      console.warn("❌ Validation failed: Missing required fields");
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    // 🔍 SQL DEBUG
    console.log("Inserting order with user_id:", userId);

    const insertOrderSql = `
      INSERT INTO orders 
      (
        user_id,
        fullName,
        phone,
        address,
        city,
        pincode,
        totalAmount,
        paymentMethod,
        paymentStatus,
        razorpayOrderId,
        razorpayPaymentId
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      insertOrderSql,
      [
        userId,
        fullName,
        phone,
        address,
        city,
        pincode,
        totalAmount,
        paymentMethod,
        paymentStatus,
        razorpayOrderId,
        razorpayPaymentId,
      ],
      (err, orderResult) => {
        if (err) {
          console.error("❌ Order insert error:", err);
          return res.status(500).json({ success: false, message: "DB error" });
        }

        const orderId = orderResult.insertId;
        console.log("✅ Order inserted. Order ID:", orderId);

        const values = items.map((it, index) => {
          console.log(`Item ${index + 1}:`, it);
          return [
            orderId,
            it.id ?? null,
            it.name ?? it.productName ?? "Unknown",
            it.price ?? 0,
            it.qty ?? it.quantity ?? 1,
            it.imageUri ?? it.imageUrl ?? null,
            "Pending",
          ];
        });

        console.log("Inserting order items:", values.length);

        const insertItemsSql = `
          INSERT INTO order_items
          (orderId, productId, productName, price, quantity, imageUrl, itemStatus)
          VALUES ?
        `;

        db.query(insertItemsSql, [values], (err2) => {
          if (err2) {
            console.error("❌ Order items insert error:", err2);
            return res
              .status(500)
              .json({ success: false, message: "DB error inserting items" });
          }

          console.log("✅ Order items inserted successfully");
          console.log("===== PLACE ORDER END =====");

          return res.json({
            success: true,
            message: "Order placed successfully",
            orderId,
            paymentMethod,
            paymentStatus,
            totalAmount,
          });
        });
      }
    );
  } catch (error) {
    console.error("🔥 Place order fatal error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// controllers/orderController.js
export const getMyOrders = (req, res) => {
 

  const userId = req.user.id;
 

  const sql = `SELECT * FROM orders WHERE user_id = ?`;

  db.query(sql, [userId], (err, orders) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ success: false });
    }

   

    if (orders.length === 0) {
      return res.json({ success: true, orders: [] });
    }

    const orderIds = orders.map(o => o.id);

    const itemsSql = `SELECT * FROM order_items WHERE orderId IN (?)`;

    db.query(itemsSql, [orderIds], (err2, items) => {
      

      const result = orders.map(o => ({
        ...o,
        items: items.filter(i => i.orderId === o.id),
      }));

      res.json({ success: true, orders: result });
    });
  });
};






// -----------------------------
// GET ALL ORDERS
// -----------------------------
export const getAllOrders = (req, res) => {
  try {
    const phoneFilter = req.query.phone;

    let ordersSql = `SELECT * FROM orders`;
    const params = [];

    if (phoneFilter) {
      ordersSql += ` WHERE phone = ?`;
      params.push(phoneFilter);
    }

    ordersSql += ` ORDER BY createdAt DESC`;

    db.query(ordersSql, params, (err, orders) => {
      if (err) return res.status(500).json({ success: false, message: "DB error" });

      if (orders.length === 0) return res.json({ success: true, orders: [] });

      const orderIds = orders.map(o => o.id);

      const itemsSql =
        `SELECT * FROM order_items WHERE orderId IN (${orderIds.map(() => '?').join(',')})`;

      db.query(itemsSql, orderIds, (err2, itemsRows) => {
        if (err2) return res.status(500).json({ success: false, message: "DB error" });

        // Group items by orderId
        const grouped = {};
        itemsRows.forEach(ir => {
          grouped[ir.orderId] = grouped[ir.orderId] || [];
          grouped[ir.orderId].push({
            id: ir.id,
            productId: ir.productId,
            productName: ir.productName,
            price: ir.price,
            quantity: ir.quantity,
            imageUrl: ir.imageUrl,
            itemStatus: ir.itemStatus || "Pending",  // <-- IMPORTANT
          });
        });

        // Final Output Format
        const result = orders.map(o => ({
          id: o.id,
          fullName: o.fullName,
          phone: o.phone,
          address:o.address,
          city:o.city,
          pincode:o.pincode,
          totalAmount: o.totalAmount,
          orderStatus: o.orderStatus,
          createdAt: o.createdAt,
          items: grouped[o.id] || [],
        }));

        return res.json({ success: true, orders: result });
      });
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


// -----------------------------
// GET ORDER BY ID
// -----------------------------
export const getOrderById = (req, res) => {
  try {
    const orderId = req.params.id;

    const orderSql = `SELECT * FROM orders WHERE id = ?`;
    db.query(orderSql, [orderId], (err, orders) => {
      if (err) return res.status(500).json({ success: false, message: "DB error" });
      if (!orders.length) return res.status(404).json({ success: false, message: "Order not found" });

      const order = orders[0];

      const itemsSql = `SELECT * FROM order_items WHERE orderId = ?`;
      db.query(itemsSql, [orderId], (err2, itemsRows) => {
        if (err2) return res.status(500).json({ success: false, message: "DB error" });

        return res.json({
          success: true,
          order: {
            id: order.id,
            fullName: order.fullName,
            phone: order.phone,
            address: order.address,
            city: order.city,
            pincode: order.pincode,
            totalAmount: order.totalAmount,
            orderStatus: order.orderStatus,
            createdAt: order.createdAt,
            items: itemsRows.map(ir => ({
              id: ir.id,
              productId: ir.productId,
              productName: ir.productName,
              price: ir.price,
              quantity: ir.quantity,
              imageUrl: ir.imageUrl,
              itemStatus: ir.itemStatus, // ✅ Added
            }))
          }
        });
      });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// -----------------------------
// UPDATE FULL ORDER STATUS
// -----------------------------
export const updateOrderStatus = (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    const valid = ['Pending','Confirmed','Shipped','Delivered','Cancelled'];
    if (!status || !valid.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const updateSql = `UPDATE orders SET orderStatus = ? WHERE id = ?`;
    db.query(updateSql, [status, orderId], (err) => {
      if (err) return res.status(500).json({ success: false, message: "DB error" });

      return res.json({
        success: true,
        message: "Order status updated",
        orderId: Number(orderId),
        status
      });
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// -----------------------------
// UPDATE INDIVIDUAL ITEM STATUS
// -----------------------------
export const updateItemStatus = (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { status } = req.body;

    const valid = ['Pending','Confirmed','Shipped','Delivered','Cancelled'];
    if (!status || !valid.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const sql = `
      UPDATE order_items 
      SET itemStatus = ? 
      WHERE id = ? AND orderId = ?
    `;

    db.query(sql, [status, itemId, orderId], (err) => {
      if (err) return res.status(500).json({ success: false, message: "DB error" });

      return res.json({
        success: true,
        message: "Item status updated",
        orderId: Number(orderId),
        itemId: Number(itemId),
        status
      });
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};



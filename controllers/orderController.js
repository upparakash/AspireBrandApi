// controllers/orderController.js
import db from "../db.js"; // your existing mysql2 createConnection export

// Helper: group items by orderId
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
    });
    return acc;
  }, {});
}

export const placeOrder = (req, res) => {
  try {
    console.log("Incoming Order Body:", req.body);
    const { fullName, phone, address, city, pincode, items, totalAmount } = req.body;
    if (!fullName || !phone || !address || !city || !pincode || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const insertOrderSql = `INSERT INTO orders (fullName, phone, address, city, pincode, totalAmount) VALUES (?, ?, ?, ?, ?, ?)`;
    db.query(insertOrderSql, [fullName, phone, address, city, pincode, totalAmount], (err, orderResult) => {
      if (err) {
        console.error("Order insert error:", err);
        return res.status(500).json({ success: false, message: "DB error" });
      }

      const orderId = orderResult.insertId;
      // Bulk insert items
      const values = items.map(it => [
        orderId,
        it.id ?? null,
        it.name ?? it.productName ?? "Unknown",
        it.price ?? 0,
        it.qty ?? it.quantity ?? 1,
        it.imageUri ?? it.imageUrl ?? null,
      ]);

      const insertItemsSql = `INSERT INTO order_items (orderId, productId, productName, price, quantity, imageUrl) VALUES ?`;
      db.query(insertItemsSql, [values], (err2) => {
        if (err2) {
          console.error("Order items insert error:", err2);
          return res.status(500).json({ success: false, message: "DB error inserting items" });
        }
        console.log("Order saved:", orderId);
        return res.json({
          success: true,
          message: "Order placed successfully",
          orderId,
          status: "Pending",
          itemsCount: items.length,
          totalAmount,
        });
      });
    });
  } catch (error) {
    console.error("placeOrder error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

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
      if (err) {
        console.error("getAllOrders - orders query error:", err);
        return res.status(500).json({ success: false, message: "DB error" });
      }

      if (!orders || orders.length === 0) return res.json({ success: true, orders: [] });

      const orderIds = orders.map(o => o.id);
      const itemsSql = `SELECT * FROM order_items WHERE orderId IN (${orderIds.map(()=>'?').join(',')})`;
      db.query(itemsSql, orderIds, (err2, itemsRows) => {
        if (err2) {
          console.error("getAllOrders - items query error:", err2);
          return res.status(500).json({ success: false, message: "DB error" });
        }

        // map items to orders
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
          });
        });

        const result = orders.map(o => ({
          id: o.id,
          fullName: o.fullName,
          phone: o.phone,
          address: o.address,
          city: o.city,
          pincode: o.pincode,
          totalAmount: o.totalAmount,
          orderStatus: o.orderStatus,
          createdAt: o.createdAt,
          items: grouped[o.id] || [],
        }));

        return res.json({ success: true, orders: result });
      });
    });
  } catch (error) {
    console.error("getAllOrders error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getOrderById = (req, res) => {
  try {
    const orderId = req.params.id;
    const orderSql = `SELECT * FROM orders WHERE id = ?`;
    db.query(orderSql, [orderId], (err, orders) => {
      if (err) {
        console.error("getOrderById order query error:", err);
        return res.status(500).json({ success: false, message: "DB error" });
      }
      if (!orders || orders.length === 0) return res.status(404).json({ success: false, message: "Order not found" });

      const order = orders[0];
      const itemsSql = `SELECT * FROM order_items WHERE orderId = ?`;
      db.query(itemsSql, [orderId], (err2, itemsRows) => {
        if (err2) {
          console.error("getOrderById items query error:", err2);
          return res.status(500).json({ success: false, message: "DB error" });
        }
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
            }))
          }
        });
      });
    });
  } catch (error) {
    console.error("getOrderById error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateOrderStatus = (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, message: "Missing status" });

    const valid = ['Pending','Confirmed','Shipped','Delivered','Cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, message: "Invalid status" });

    const updateSql = `UPDATE orders SET orderStatus = ? WHERE id = ?`;
    db.query(updateSql, [status, orderId], (err, result) => {
      if (err) {
        console.error("updateOrderStatus error:", err);
        return res.status(500).json({ success: false, message: "DB error" });
      }
      return res.json({ success: true, message: "Status updated", orderId: Number(orderId), status });
    });
  } catch (error) {
    console.error("updateOrderStatus exception:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

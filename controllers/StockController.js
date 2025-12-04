import db from "../db.js";

// ================= GET STOCK INFORMATION =================
export const getStocks = (req, res) => {
  console.log("🔍 Incoming GET /getStocks request");
  console.log("Query Params:", req.query);

  const { category } = req.query;

  let query = `
    SELECT 
      sc.id AS productId,
      sc.subCategaryname AS productName,
      pc.productCategory AS categoryName,
      COALESCE(SUM(st.stock), 0) AS stock
    FROM subcategories sc
    LEFT JOIN product_categories pc 
      ON pc.productName = sc.productCategory
    LEFT JOIN stock st 
      ON st.subcategoryId = sc.id
  `;

  if (category) {
    console.log("Filtering by category:", category);
    query += ` WHERE sc.productCategory = ${db.escape(category)}`;
  }

  query += ` GROUP BY sc.id, sc.subCategaryname, pc.productCategory
             ORDER BY pc.productCategory, sc.subCategaryname`;

  console.log("Executing SQL Query:", query);

  db.query(query, (err, rows) => {
    if (err) {
      console.error("❌ ERROR executing getStocks:", err);
      return res.status(500).json({ error: err });
    }

    console.log("✔ getStocks Success:", rows.length, "rows");
    res.json({ success: true, data: rows });
  });
};
export const getStockById = (req, res) => {
  console.log("🔍 Incoming GET /getStockById");
  console.log("Query Params:", req.query);

  const { subcategoryId } = req.query;

  if (!subcategoryId) {
    return res.status(400).json({
      success: false,
      message: "subcategoryId is required",
    });
  }

  const query = `
    SELECT 
      COALESCE(SUM(stock), 0) AS totalStock
    FROM stock
    WHERE subcategoryId = ?
  `;

  db.query(query, [subcategoryId], (err, rows) => {
    if (err) {
      console.error("❌ ERROR executing getStockById:", err);
      return res.status(500).json({ error: err });
    }

    res.json({
      success: true,
      subcategoryId,
      totalStock: rows[0].totalStock,
    });
  });
};

// ================= ADD OR UPDATE STOCK =================
export const updateStock = (req, res) => {
  console.log("📝 Incoming POST /updateStock request");
  console.log("Body:", req.body);

  const { subcategoryId, stock } = req.body;

  if (!subcategoryId || stock === undefined) {
    console.log("❌ Missing fields:", { subcategoryId, stock });
    return res.status(400).json({ error: "subcategoryId and stock are required" });
  }

  // Add new stock to old stock if exists
  const query = `
    INSERT INTO stock (subcategoryId, stock)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE stock = stock + VALUES(stock)
  `;

  console.log("Executing SQL Query:", query);
  console.log("Values:", [subcategoryId, stock]);

  db.query(query, [subcategoryId, stock], (err, result) => {
    if (err) {
      console.error("❌ ERROR executing updateStock:", err);
      return res.status(500).json({ error: err });
    }

    console.log("✔ updateStock Success:", result);
    res.json({ success: true, message: "Stock added successfully!" });
  });
};

// ================= GET PRODUCT CATEGORIES =================
export const getCategories = (req, res) => {
  console.log("🔍 Incoming GET /getCategories");

  const sql = "SELECT DISTINCT productCategory FROM subcategories";
  console.log("Executing SQL Query:", sql);

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("❌ ERROR executing getCategories:", err);
      return res.status(500).json({ error: err });
    }

    console.log("✔ getCategories Success:", rows.length, "rows");
    res.json({ success: true, data: rows });
  });
};



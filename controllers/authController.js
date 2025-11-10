import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../db.js";
// REGISTER new user
export const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ message: "All fields are required" });
  try {
    // Check if email already exists
    const checkQuery = "SELECT * FROM users WHERE email = ?";
    db.query(checkQuery, [email], async (err, results) => {
      if (err) return res.status(500).json({ message: "DB error", error: err });
      if (results.length > 0)
        return res.status(400).json({ message: "Email already exists" });

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert user
      const insertQuery = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";
      db.query(insertQuery, [name, email, hashedPassword], (err, result) => {
        if (err)
          return res.status(500).json({ message: "Error inserting user", error: err });

        res.status(201).json({
          message: "User created successfully",
          userId: result.insertId,
        });
      });
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

export const login = (req, res) => {
  const { email, password } = req.body;
  const sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [email], async (err, result) => {
    if (err) return res.status(500).json({ message: "DB error", error: err });
    if (result.length === 0) return res.status(401).json({ message: "User not found" });

    const user = result[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  });
};

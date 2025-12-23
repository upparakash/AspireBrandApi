import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import http from "http";
import { Server } from "socket.io";
import authRoutes from "./routes/authRoutes.js";
import addProductRoutes from "./routes/addProductRoutes.js";
import productCategoryRoutes from "./routes/productCategoryRoutes.js";
import addSubCategoryRoutes from "./routes/addSubCategoryRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import customerRegisterRoutes from "./routes/CustomerRegisterRouter.js";
import StockRouter  from './routes/StockRouter.js';
import bannerRouter from "./routes/BannerRouter.js";
dotenv.config();
const app = express();

// ----------- SOCKET.IO SETUP -------------
export let io; // ✅ export io so controllers can use it

// Create HTTP Server (Required for socket.io)
const server = http.createServer(app);

// Initialize socket
io = new Server(server, {
  cors: {
     origin: ["http://localhost:5173", "http://10.0.2.2:5173","https://abs-admin-dashboard-frontend.vercel.app", "https://jewellery.aspireths.com","https://aspire-brand-store-website.vercel.app","https://www.aspirebrand.store"],
    credentials: true,
  },
});

// On client connection
io.on("connection", (socket) => {
  console.log("🔥 Socket connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
  });
});

// ----------- MIDDLEWARES -------------
app.use(
  cors({
    origin: ["http://localhost:5173", "http://10.0.2.2:5173","https://abs-admin-dashboard-frontend.vercel.app", "https://jewellery.aspireths.com","https://aspire-brand-store-website.vercel.app","https://www.aspirebrand.store"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Serve static uploads
app.use("/uploads", express.static(path.join("uploads")));
// ----------- ROUTES -------------
app.use("/api/auth", authRoutes);
app.use("/api/products", addProductRoutes);
app.use("/api/productCategories", productCategoryRoutes);
app.use("/api/subcategories", addSubCategoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/customers", customerRegisterRoutes);
app.use("/api/stock", StockRouter);
app.use("/api/banner", bannerRouter);
// ----------- START SERVER -------------
const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`🚀 Server with Socket.IO running on port ${PORT}`);
});

import express from "express";
import {
  addBanner,
  getBanners,
  updateBanner,
  deleteBanner,
  upload,
} from "../controllers/BannerController.js";

const router = express.Router();

router.post("/add", upload.single("bannerImage"), addBanner);

router.get("/all", getBanners);

router.put("/update/:id", upload.single("bannerImage"), updateBanner);

router.delete("/delete/:id", deleteBanner);

export default router;

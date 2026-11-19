import { Router } from "express";
import jwt from "jsonwebtoken";
import passport from "passport";
import User from "../models/user.model.js";
import { sendAuthNotification } from "../config/mq.js";
const router = Router();

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/" }),
  async (req, res) => {
    try {
      const { id, displayName, emails, photos } = req.user;

      let user = await User.findOne({ googleId: id });
 
       await sendAuthNotification({
        userID:user._id,
        action:'google_login',
        timestamp:new Date(),
        email:emails[0].value
       })

      if (!user) {
        user = new User({
          googleId: id,
          email: emails?.[0]?.value,
          name: displayName,
          avatar: photos?.[0]?.value,
        });
        await user.save();
      }

      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });

      res.cookie("token", token, { httpOnly: true });
      res.redirect("/");
    } catch (err) {
      console.log("Error during Google authentication", err);
      res.redirect("/");
    }
  }
);

export default router;
import express from "express";
import morgan from "morgan";
import { channel, QUEUE } from "./mq.js";
import { sendEmail } from "./email.js";

const app = express();
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.send("Hello from notification service");
});

app.get("/_status/healthz",(req,res)=>{
  res.status(200).json({status:"ok"})
})

app.get("",()=>{
  
})




if (channel) {
  channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content.toString());
      console.log("Received notification:", data);

      await sendEmail(
        data.email,
        "Login Notification",
        `You logged in via ${data.action} at ${data.timestamp}`,
        `<p>You logged in via <b>${data.action}</b> at ${data.timestamp}.</p>`
      );

      channel.ack(msg);
    } catch (error) {
      console.error("Error processing notification:", error.message);
      channel.nack(msg, false, false);
    }
  });
}

export default app;

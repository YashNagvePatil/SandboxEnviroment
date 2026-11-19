import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";
import { connectMQ } from "./src/config/mq.js";

connectDB();
connectMQ();

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});

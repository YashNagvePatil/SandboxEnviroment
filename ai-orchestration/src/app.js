import express from "express";
import morgan from "morgan";
import agentRouter from "./routes/agnets.routes.js";
import { MistralAI } from "@langchain/mistralai";
import dotenv from "dotenv";
dotenv.config();


//middleware
const app = express();
app.use(morgan("dev"));
app.use(express.json());

//Routes

app.get("/api/status/healthz", (req, res) => {
  res.status(200).json({ message: "Hello World" });
}   
)

app.get("/api/ai/healthz", (req, res) => {
  res.status(200).json({ message: "Hello World" });
}   );

app.use("/api/ai", agentRouter);

export default app;
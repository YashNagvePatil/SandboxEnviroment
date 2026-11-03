import express from "express";
import morgan from "morgan";
import { MistralAI } from "@langchain/mistralai";
import dotenv from "dotenv";
dotenv.config();


//middleware
const app = express();
app.use(morgan("dev"));
app.use(express.json());

//Routes

app.get("/", (req, res) => {
  res.send("Hello World");
}   );

export default app;
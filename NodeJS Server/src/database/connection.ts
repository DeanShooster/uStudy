import "../config/loadEnv";
import mongoose from "mongoose";

const mongoUri = process.env.DB_KEY_NAME;

if (!mongoUri) {
  throw new Error("Missing required environment variable: DB_KEY_NAME");
}

const mainDB = mongoose.createConnection(mongoUri);

mainDB.on("connected", () => console.log("Database connection established successfully"));
mainDB.on("error", (error) => console.error("Database connection error:", error));

export default mainDB;
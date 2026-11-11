import { Schema, type Model } from "mongoose";
import mainDB from "../../connection";
import type { ISession, ISessionMessage } from "./interface";

type SessionModel = Model<ISession>;

const MessageSchema = new Schema<ISessionMessage>(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    text: { type: String, default: "" },
    source: { type: String, enum: ["text", "voice", "board"] },
  },
  { _id: false },
);

const SessionSchema = new Schema<ISession, SessionModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    topic: { type: String, required: true, trim: true },
    phase: { type: String, enum: ["greet", "teach", "riddle", "done"], default: "greet" },
    messages: { type: [MessageSchema], default: undefined },
  },
  { timestamps: true },
);

export const Session = mainDB.model<ISession, SessionModel>("Session", SessionSchema);

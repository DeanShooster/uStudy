import type { Types } from "mongoose";

export type SessionRole = "user" | "assistant";

export type SessionSource = "text" | "voice" | "board";

export type LessonPhase = "greet" | "teach" | "riddle" | "done";

export interface ISessionMessage {
  role: SessionRole;
  text: string;
  source?: SessionSource;
}

export interface ISession {
  user: Types.ObjectId;
  topic: string;
  phase: LessonPhase;
  messages: ISessionMessage[];
}

import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { routing } from "../routing";
import { createSessionHandler, messageHandler, speechHandler, transcribeHandler } from "./classroom.controller";
import { validateCreateSession, validateMessage, validateSessionParams, validateSpeech, validateTranscribe } from "./classroom.schema";

const classroomRouter = Router();

classroomRouter.post(routing.classroom.sessions, authenticate, validateCreateSession, createSessionHandler);
classroomRouter.post(routing.classroom.speech, authenticate, validateSpeech, speechHandler);
classroomRouter.post(routing.classroom.transcribe, authenticate, validateTranscribe, transcribeHandler);
classroomRouter.post(
  routing.classroom.message,
  authenticate,
  validateSessionParams,
  validateMessage,
  messageHandler,
);

export default classroomRouter;

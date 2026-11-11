import type { Request, Response } from "express";
import { HttpStatus } from "../../constants";
import { requireEmail } from "../../middlewares/authenticate";
import { routeParam } from "../../middlewares/validate";
import type { CreateSessionInput, MessageInput, SpeechInput, TranscribeInput } from "./classroom.schema";
import { createSession, streamMessage, synthesizeSpeech, transcribeSpeech } from "./classroom.service";

export async function createSessionHandler(req: Request, res: Response): Promise<void> {
  const session = await createSession(requireEmail(req), req.body as CreateSessionInput);
  res.status(HttpStatus.created).json({ session });
}

export async function speechHandler(req: Request, res: Response): Promise<void> {
  requireEmail(req);
  const audio = await synthesizeSpeech((req.body as SpeechInput).text);
  res.status(HttpStatus.ok);
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Cache-Control", "no-store");
  res.send(audio);
}

export async function transcribeHandler(req: Request, res: Response): Promise<void> {
  requireEmail(req);
  const text = await transcribeSpeech((req.body as TranscribeInput).audio);
  res.status(HttpStatus.ok).json({ text });
}

export async function messageHandler(req: Request, res: Response): Promise<void> {
  const id = routeParam(req, "id");
  await streamMessage(requireEmail(req), id, req.body as MessageInput, res);
}

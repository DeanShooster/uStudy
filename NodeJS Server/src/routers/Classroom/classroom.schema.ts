import { z } from "zod";
import { ErrorMessage } from "../../constants";
import { validate, validateParams } from "../../middlewares/validate";

export const createSessionSchema = z.object({
  topic: z.string().trim().min(1, ErrorMessage.invalidRequest).max(200, ErrorMessage.invalidRequest),
});

const boardImageSchema = z
  .string()
  .trim()
  .max(2_500_000, ErrorMessage.invalidRequest)
  .refine((value) => value.startsWith("data:image/jpeg;base64,"), ErrorMessage.invalidRequest);

export const messageSchema = z
  .object({
    text: z.string().trim().max(4000, ErrorMessage.invalidRequest).default(""),
    image: boardImageSchema.optional(),
    source: z.enum(["text", "voice", "start", "board", "continue"], ErrorMessage.invalidRequest),
  })
  .refine((value) => {
    if (value.source === "start" || value.source === "continue") return true;
    if (value.source === "board") return Boolean(value.image);
    return value.text.length > 0 || Boolean(value.image);
  }, ErrorMessage.emptyMessage);

export const sessionParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, ErrorMessage.sessionNotFound),
});

export const speechSchema = z.object({
  text: z.string().trim().min(1, ErrorMessage.invalidRequest).max(4000, ErrorMessage.invalidRequest),
});

export const transcribeSchema = z.object({
  audio: z
    .string()
    .trim()
    .max(2_500_000, ErrorMessage.invalidRequest)
    .refine((value) => value.startsWith("data:audio/"), ErrorMessage.invalidRequest),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type SpeechInput = z.infer<typeof speechSchema>;
export type TranscribeInput = z.infer<typeof transcribeSchema>;
export type MessageInput = z.infer<typeof messageSchema>;

export const validateCreateSession = validate(createSessionSchema);
export const validateSpeech = validate(speechSchema);
export const validateTranscribe = validate(transcribeSchema);
export const validateMessage = validate(messageSchema);
export const validateSessionParams = validateParams(sessionParamSchema);

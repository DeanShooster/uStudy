import type { Response } from "express";
import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ErrorMessage, HttpStatus } from "../../constants";
import { Session } from "../../database/models/session/session";
import type { ISessionMessage, LessonPhase } from "../../database/models/session/interface";
import { requireUser } from "../../database/models/user/user";
import { AppError } from "../../middlewares/ErrorHandler";
import { readTopicProgress, setTopicProgress } from "../Course/course.service";
import type { CreateSessionInput, MessageInput } from "./classroom.schema";

const HISTORY_LIMIT = 20;
const SAY = "<<say>>";
const BOARD = "<<board>>";
const PHASE = "<<phase>>";
const PROGRESS = "<<progress>>";
const lessonStarts = new Set<string>();

type ChatContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: ChatContent;
};

function lessonPrompt(topic: string, name: string, phase: LessonPhase, progress: number, watching: boolean) {
  return [
    `You are the uStudy tutor sitting with ${name}. The lesson topic is "${topic}".`,
    "Teach one idea at a time, but say it as a full paragraph of about five to eight sentences. Walk through the logic so the student can follow the reason, not only the result.",
    "Do not stop after one sentence, and do not ask if they are ready or if it is clear after every step.",
    "Phases:",
    "- greet: say hello, use the student's name, say the topic name, and ask if they are ready. Do not teach yet. The board is only the topic name.",
    "- teach: one paragraph about one idea. The board must show one concrete example from this topic, such as an equation or a labeled fact. Never leave the board empty on a teach turn.",
    "- riddle: one paragraph that sets up a single problem, then ask them to write the answer on the board. The board shows the problem.",
    "When they say they are ready, or they press Continue, leave greet and teach the first paragraph.",
    "When they press Continue after a paragraph, teach the next idea or give one problem, never both in the same turn.",
    "When they press Continue during a problem, explain that solution in a paragraph, then move on.",
    "When they are confused, stay on the same idea and put a simpler example on the board.",
    "- done: the lesson is finished. Tell them they have completed this topic. Do not start a new idea.",
    `Their progress on this topic is ${progress} out of 100. Never lower it.`,
    "Raise progress only for something they have now learned. A greeting stays put. One new idea raises it by about 20. A solved problem raises it further.",
    "When the main idea is understood and they have handled a problem, set phase to done and progress to 100.",
    watching
      ? "The student is writing an answer on the board right now. The image shows your writing and theirs. If the work is unfinished, say nothing. If there is a clear mistake, give one short hint and do not reveal the answer. If the answer is right, praise them and continue with the next paragraph."
      : "When an image is attached, it is the board. Read the student's writing and respond to it.",
    `The lesson is currently in the ${phase} phase.`,
    "Reply in this exact shape and nothing else. Do not add a title or markdown.",
    `${SAY}`,
    "the words you speak, and nothing else in this part",
    `${BOARD}`,
    "one plain board line per line, or NONE",
    `${PHASE}`,
    "one of: greet, teach, riddle, done",
    `${PROGRESS}`,
    "an integer from 0 to 100",
    "Board lines are text the student can read, such as an equation or a short label. At most 6 lines.",
    "On the greeting, the board is only the topic name.",
    "While you are only hinting at work already on the board, the board part is NONE so their writing stays.",
  ].join("\n");
}

function tutorMessages(
  topic: string,
  name: string,
  phase: LessonPhase,
  progress: number,
  history: ISessionMessage[],
  image: string | undefined,
  watching: boolean,
  opening: boolean,
  continuing: boolean,
): ChatMessage[] {
  const recent = history.slice(-HISTORY_LIMIT);
  const messages: ChatMessage[] = [
    { role: "system", content: lessonPrompt(topic, name, phase, progress, watching) },
  ];

  recent.forEach((message, index) => {
    const latest = index === recent.length - 1 && message.role === "user";
    const text = message.text.trim() || (latest && image ? "The student sent their board." : "");
    if (!text) return;

    if (message.role === "assistant") {
      messages.push({ role: "assistant", content: text });
      return;
    }

    if (latest && image && !watching) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text },
          { type: "image_url", image_url: { url: image } },
        ],
      });
      return;
    }

    messages.push({ role: "user", content: text });
  });

  if (opening) {
    messages.push({
      role: "user",
      content: `The lesson is starting now. Greet ${name} by name once, name the topic, and ask if they are ready to begin.`,
    });
  }

  if (!opening && phase === "greet" && studentIsReady(history)) {
    messages.push({
      role: "user",
      content: "The greeting is already done and the student said they are ready. Teach the first paragraph now. Do not welcome them or ask if they are ready again.",
    });
  }

  if (continuing) {
    messages.push({
      role: "user",
      content: "The student pressed Continue. They have nothing to say or write. Carry the lesson forward with the next paragraph.",
    });
  }

  if (watching && image) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: "The student is writing on the board now. Read their work." },
        { type: "image_url", image_url: { url: image } },
      ],
    });
  }

  return messages;
}

function plain(text: string) {
  return text.replace(/[$`*#]/g, "");
}

function boardLines(raw: string) {
  const text = raw.trim();
  if (!text || text.toUpperCase() === "NONE") return [];
  return text
    .split(/\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 0 && line.toUpperCase() !== "NONE")
    .slice(0, 6)
    .map((line) => plain(line).slice(0, 80))
    .filter((line) => line.trim().length > 0);
}

function readPhase(raw: string): LessonPhase | null {
  const matches = raw.toLowerCase().match(/\b(greet|teach|riddle|done)\b/g);
  const value = matches?.[matches.length - 1];
  if (value === "greet" || value === "teach" || value === "riddle" || value === "done") return value;
  return null;
}

function studentIsReady(history: ISessionMessage[]): boolean {
  const last = [...history].reverse().find((message) => message.role === "user");
  if (!last) return false;
  return /\b(i'?m ready|i am ready|ready to|let'?s (start|begin|go)|yes[,.!]?\s*$)\b/i.test(last.text.trim());
}

function readProgress(raw: string) {
  const match = raw.match(/\b(\d{1,3})\b/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isInteger(value) || value > 100) return null;
  return value;
}

class LessonSpeech {
  raw = "";
  private sent = 0;

  push(token: string) {
    this.raw += token;
    const body = this.sayBody();
    if (body === null) return "";
    const closed = this.raw.includes(BOARD);
    const safe = closed ? body : body.slice(0, Math.max(0, body.length - (BOARD.length - 1)));
    const delta = safe.slice(this.sent);
    this.sent = safe.length;
    return delta;
  }

  finish() {
    const body = this.sayBody();
    const say = (body ?? this.raw).trim();
    const pending = body === null ? say : body.slice(this.sent);
    const boardStart = this.raw.indexOf(BOARD);
    const phaseStart = this.raw.indexOf(PHASE);
    const progressStart = this.raw.indexOf(PROGRESS);
    const boardRaw = boardStart === -1 ? "" : this.raw.slice(boardStart + BOARD.length, phaseStart === -1 ? undefined : phaseStart);
    const phaseRaw = phaseStart === -1 ? "" : this.raw.slice(phaseStart + PHASE.length, progressStart === -1 ? undefined : progressStart);
    const progressRaw = progressStart === -1 ? "" : this.raw.slice(progressStart + PROGRESS.length);
    return {
      say,
      pending: pending.trim() ? pending : "",
      board: body === null ? [] : boardLines(boardRaw),
      phase: body === null ? null : readPhase(phaseRaw),
      progress: body === null ? null : readProgress(progressRaw),
    };
  }

  private sayBody() {
    const start = this.raw.indexOf(SAY);
    if (start === -1) return null;
    const from = start + SAY.length;
    const end = this.raw.indexOf(BOARD, from);
    return this.raw.slice(from, end === -1 ? undefined : end).replace(/^\s+/, "");
  }
}

function requireTutorKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new AppError(HttpStatus.unavailable, ErrorMessage.tutorNotConfigured);
  }
  return key;
}

async function streamCompletion(messages: ChatMessage[], onToken: (token: string) => void, signal: AbortSignal) {
  const key = requireTutorKey();

  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      stream: true,
      temperature: 0.4,
      max_tokens: 800,
      messages,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    console.error("Tutor request failed", response.status);
    throw new Error(ErrorMessage.tutorFailed);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      let payload: { choices?: { delta?: { content?: string } }[] };
      try {
        payload = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
      } catch {
        continue;
      }

      const token = payload.choices?.[0]?.delta?.content ?? "";
      if (!token) continue;
      full += token;
      onToken(token);
    }
  }
  } catch (error) {
    if (signal.aborted) return full;
    throw error;
  }

  return full;
}

export async function createSession(email: string, input: CreateSessionInput) {
  const user = await requireUser(email);

  const session = await Session.create({ user: user._id, topic: input.topic, phase: "greet", messages: [] });
  return { id: session.id, topic: session.topic };
}

export async function streamMessage(email: string, id: string, input: MessageInput, res: Response) {
  requireTutorKey();

  const user = await requireUser(email);

  const session = await Session.findOne({ _id: id, user: user._id });
  if (!session) {
    throw new AppError(HttpStatus.notFound, ErrorMessage.sessionNotFound);
  }

  const opening = input.source === "start" && !(session.messages ?? []).some((message) => message.role === "assistant");
  const watching = input.source === "board";
  const continuing = input.source === "continue";
  const phase = session.phase || "greet";
  const sessionKey = String(session.id);

  if (input.source === "start" && !opening) {
    writeLessonEvent(res, { phase });
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }

  if (opening) {
    if (lessonStarts.has(sessionKey)) {
      writeLessonEvent(res, { phase });
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    lessonStarts.add(sessionKey);
  }

  session.messages = session.messages ?? [];
  if (!opening && !watching && !continuing) {
    const source = input.source === "voice" ? "voice" : "text";
    session.messages.push({ role: "user", text: input.text, source });
    await session.save();
  }

  res.status(HttpStatus.ok);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const ready = !opening && phase === "greet" && studentIsReady(session.messages);
  const promptPhase: LessonPhase = ready ? "teach" : phase;

  const controller = new AbortController();
  res.on("close", () => controller.abort());

  try {
    const speech = new LessonSpeech();
    const name = user.name?.trim() || "there";
    const currentProgress = await readTopicProgress(email, session.topic);
    await streamCompletion(
      tutorMessages(session.topic, name, promptPhase, currentProgress, session.messages, input.image, watching, opening, continuing),
      (token) => {
        const delta = plain(speech.push(token));
        if (delta && !res.writableEnded) res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
      },
      controller.signal,
    );

    if (controller.signal.aborted || res.writableEnded) return;

    const lesson = speech.finish();
    lesson.say = plain(lesson.say).trim();
    lesson.pending = plain(lesson.pending);
    if (!lesson.say && !watching) {
      throw new Error(ErrorMessage.tutorFailed);
    }
    if (lesson.pending && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ text: lesson.pending })}\n\n`);
    }

    let nextPhase = lesson.phase ?? promptPhase;
    if ((phase !== "greet" || ready) && nextPhase === "greet") nextPhase = ready ? "teach" : phase;
    const reported = nextPhase === "done" ? 100 : lesson.progress;
    if (lesson.say && reported !== null && (nextPhase === "done" || reported > currentProgress)) {
      const saved = await setTopicProgress(email, session.topic, reported);
      if (saved !== null && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ progress: saved })}\n\n`);
      }
    }
    const keepWork = watching && nextPhase === "riddle";
    if (lesson.board.length > 0 && !keepWork && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ board: lesson.board })}\n\n`);
    }
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ phase: nextPhase })}\n\n`);
    }

    if (lesson.say) {
      if (watching) {
        session.messages.push({ role: "user", text: "The student is writing on the board.", source: "board" });
      }
      session.messages.push({ role: "assistant", text: lesson.say });
    }
    session.phase = nextPhase;
    await session.save();

    if (!controller.signal.aborted && !res.writableEnded) {
      res.write("data: [DONE]\n\n");
    }
  } catch (error) {
    if (controller.signal.aborted || res.writableEnded) return;
    console.error(error);
    const message = error instanceof AppError ? error.message : ErrorMessage.tutorFailed;
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
  } finally {
    if (opening) lessonStarts.delete(sessionKey);
    if (!res.writableEnded) res.end();
  }
}

function writeLessonEvent(res: Response, payload: { phase: LessonPhase }) {
  res.status(HttpStatus.ok);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function geminiRoot() {
  const base = (process.env.OPENAI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, "");
  return base.replace(/\/openai$/, "");
}

function walkAudio(value: unknown, key = ""): { data: string; mime: string } | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = walkAudio(item, key);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const data = typeof record.data === "string" ? record.data : null;
  const mimeValue = record.mime_type ?? record.mimeType;
  const mime = typeof mimeValue === "string" ? mimeValue : "";
  if (data && data.length > 100 && (mime.startsWith("audio") || /audio|inline/i.test(key))) {
    return { data, mime: mime || "audio/wav" };
  }

  for (const [childKey, child] of Object.entries(record)) {
    const found = walkAudio(child, childKey);
    if (found) return found;
  }
  return null;
}

function toWav(bytes: Buffer, mime: string) {
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF") return bytes;
  const rate = Number(/rate=(\d+)/i.exec(mime)?.[1] ?? 24000);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + bytes.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(bytes.length, 40);
  return Buffer.concat([header, bytes]);
}

const TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-2.5-flash-tts", "gemini-3.8-flash-lite-tts"];

function speechModels() {
  const preferred = process.env.OPENAI_TTS_MODEL?.trim();
  return [...new Set([preferred, ...TTS_MODELS].filter((model): model is string => Boolean(model)))];
}

async function synthesizeLocally(text: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "ustudy-voice-"));
  const input = join(dir, "speech.txt");
  const output = join(dir, "speech.wav");
  const script = join(dir, "speak.ps1");

  await writeFile(input, text, "utf8");
  await writeFile(
    script,
    [
      "Add-Type -AssemblyName System.Speech",
      "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      "$synth.SetOutputToWaveFile($env:USTUDY_TTS_OUT)",
      "$synth.Speak([System.IO.File]::ReadAllText($env:USTUDY_TTS_IN))",
      "$synth.Dispose()",
    ].join("\n"),
    "utf8",
  );

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
        { env: { ...process.env, USTUDY_TTS_IN: input, USTUDY_TTS_OUT: output }, windowsHide: true },
      );
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `Local speech exited with code ${code}`));
      });
    });

    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(detail: string) {
  const clock = /retry in (?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/i.exec(detail);
  if (clock && (clock[1] || clock[2] || clock[3])) {
    const hours = Number(clock[1] ?? 0);
    const minutes = Number(clock[2] ?? 0);
    const seconds = Number(clock[3] ?? 0);
    return ((hours * 60 + minutes) * 60 + seconds) * 1000;
  }
  const quoted = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(detail);
  if (quoted) return Number(quoted[1]) * 1000;
  return null;
}

async function synthesizeWithGemini(text: string): Promise<Buffer | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const voice = process.env.OPENAI_TTS_VOICE || "Kore";
  for (const model of speechModels()) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await requestAudio(model, text, voice, key);
      if (response.ok) {
        const audio = walkAudio(await response.json());
        if (audio) return toWav(Buffer.from(audio.data, "base64"), audio.mime);
        break;
      }

      const detail = await response.text();
      console.error("Tutor speech failed", model, response.status, detail.slice(0, 180));
      const delay = response.status === 429 ? retryDelayMs(detail) : null;
      if (delay !== null && delay <= 8000 && attempt === 0) {
        await wait(delay);
        continue;
      }
      if (response.status === 429 || response.status === 404) break;
      return null;
    }
  }

  return null;
}

export async function synthesizeSpeech(text: string) {
  if (process.env.VOICE_PROVIDER === "local") {
    try {
      return await synthesizeLocally(text);
    } catch (error) {
      console.error("Local speech failed", error);
      throw new AppError(HttpStatus.unavailable, ErrorMessage.tutorFailed);
    }
  }

  try {
    const audio = await synthesizeWithGemini(text);
    if (audio) return audio;
  } catch (error) {
    console.error("Cloud speech failed", error);
  }

  throw new AppError(HttpStatus.unavailable, ErrorMessage.tutorFailed);
}

async function requestAudio(model: string, text: string, voice: string, key: string) {
  return fetch(`${geminiRoot()}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { voice } },
      },
    }),
  });
}

function readTranscript(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates;
  const parts = candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("").trim();
}

export async function transcribeSpeech(audio: string) {
  const key = requireTutorKey();

  const match = /^data:(audio\/[\w.+-]+)(?:;[^,]*)?;base64,([\s\S]+)$/.exec(audio);
  if (!match) {
    throw new AppError(HttpStatus.badRequest, ErrorMessage.invalidRequest);
  }

  const model = process.env.OPENAI_MODEL || "gemini-3.5-flash-lite";
  const response = await fetch(`${geminiRoot()}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: "Transcribe the speech in this audio. If there is no clear speech, reply with exactly NONE. Otherwise reply with only the words that were spoken." },
            { inlineData: { mimeType: match[1], data: match[2] } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Tutor transcription failed", response.status, detail.slice(0, 240));
    throw new AppError(HttpStatus.unavailable, ErrorMessage.tutorFailed);
  }

  const payload: unknown = await response.json();
  return readTranscript(payload);
}

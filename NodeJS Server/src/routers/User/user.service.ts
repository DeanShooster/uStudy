import jwt from "jsonwebtoken";
import { ErrorMessage, HttpStatus } from "../../constants";
import type { ITopic } from "../../database/models/course/interface";
import type { IUser } from "../../database/models/user/interface";
import { User, requireUser } from "../../database/models/user/user";
import { AppError } from "../../middlewares/ErrorHandler";
import type { SignInInput, SignUpInput } from "./user.schema";
import { topicNamesById } from "../Course/course.service";

export interface UserTopicProgress {
  topic: ITopic;
  progress: number;
}

export interface PublicUser {
  name: string;
  email: string;
  topics: UserTopicProgress[];
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

function getSecret(): string {
  const secret = process.env.SECRET;

  if (!secret) {
    throw new AppError(HttpStatus.internal, "Missing required environment variable: SECRET");
  }

  return secret;
}

export function generateToken(email: string): string {
  return jwt.sign({ email }, getSecret());
}

export function readTokenEmail(token: string): string {
  const decoded = jwt.verify(token, getSecret());

  if (typeof decoded === "string" || typeof decoded.email !== "string") {
    throw new AppError(HttpStatus.unauthorized, ErrorMessage.invalidToken);
  }

  return decoded.email;
}

function topicName(topic: unknown): string | null {
  if (topic && typeof topic === "object" && "name" in topic && typeof topic.name === "string") {
    return topic.name;
  }

  return null;
}

async function toPublicUser(user: Pick<IUser, "name" | "email" | "topics">): Promise<PublicUser> {
  const topics = user.topics ?? [];
  const names = topics.length > 0 ? await topicNamesById() : new Map<string, string>();

  return {
    name: user.name,
    email: user.email,
    topics: topics.flatMap((entry) => {
      const name = topicName(entry.topic) ?? names.get(String(entry.topic));
      if (!name) return [];
      return [{ topic: { name }, progress: entry.progress ?? 0 }];
    }),
  };
}

export async function toPublicTopics(user: Pick<IUser, "name" | "email" | "topics">): Promise<UserTopicProgress[]> {
  return (await toPublicUser(user)).topics;
}

export async function signUp(input: SignUpInput): Promise<AuthResult> {
  const existing = await User.findOne({ email: input.email });

  if (existing) {
    throw new AppError(HttpStatus.conflict, ErrorMessage.emailTaken);
  }

  const user = await User.create({
    name: input.name,
    email: input.email,
    password: input.password,
  });

  return {
    token: generateToken(user.email),
    user: await toPublicUser(user),
  };
}

export async function signIn(input: SignInInput): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email }).select("+password");

  if (!user || !(await user.comparePassword(input.password))) {
    throw new AppError(HttpStatus.unauthorized, ErrorMessage.invalidCredentials);
  }

  return {
    token: generateToken(user.email),
    user: await toPublicUser(user),
  };
}

export async function getAuthenticatedUser(email: string): Promise<PublicUser> {
  return toPublicUser(await requireUser(email));
}

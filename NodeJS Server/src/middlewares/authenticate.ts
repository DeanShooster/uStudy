import type { NextFunction, Request, Response } from "express";
import { ErrorMessage, HttpStatus } from "../constants";
import { AppError } from "./ErrorHandler";
import { readTokenEmail } from "../routers/User/user.service";

declare global {
  namespace Express {
    interface Request {
      userEmail?: string;
    }
  }
}

export function requireEmail(req: Request): string {
  if (!req.userEmail) {
    throw new AppError(HttpStatus.unauthorized, ErrorMessage.authRequired);
  }

  return req.userEmail;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    next(new AppError(HttpStatus.unauthorized, ErrorMessage.authRequired));
    return;
  }

  try {
    req.userEmail = readTokenEmail(header.slice("Bearer ".length));
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    next(new AppError(HttpStatus.unauthorized, ErrorMessage.invalidToken));
  }
}

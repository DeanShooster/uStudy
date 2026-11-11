import type { NextFunction, Request, Response } from "express";
import { ErrorMessage, HttpStatus } from "../constants";

export class AppError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === 11000
  );
}

export function ErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  if (isDuplicateKeyError(err)) {
    res.status(HttpStatus.conflict).json({ message: ErrorMessage.emailTaken });
    return;
  }

  console.error(err);
  res.status(HttpStatus.internal).json({ message: ErrorMessage.internal });
}

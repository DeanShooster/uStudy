import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { ErrorMessage, HttpStatus } from "../constants";
import { AppError } from "./ErrorHandler";

function validatePart(part: "body" | "params", schema: z.ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      next(new AppError(HttpStatus.badRequest, result.error.issues[0]?.message ?? ErrorMessage.invalidRequest));
      return;
    }

    if (part === "body") {
      req.body = result.data;
    } else {
      req.params = result.data as Request["params"];
    }

    next();
  };
}

export function validate(schema: z.ZodType) {
  return validatePart("body", schema);
}

export function validateParams(schema: z.ZodType) {
  return validatePart("params", schema);
}

export function routeParam(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : value;
}

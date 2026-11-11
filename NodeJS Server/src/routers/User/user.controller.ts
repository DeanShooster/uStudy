import type { Request, Response } from "express";
import { HttpStatus } from "../../constants";
import { requireEmail } from "../../middlewares/authenticate";
import type { SignInInput, SignUpInput } from "./user.schema";
import { getAuthenticatedUser, signIn, signUp } from "./user.service";

export async function signUpHandler(req: Request, res: Response): Promise<void> {
  const result = await signUp(req.body as SignUpInput);
  res.status(HttpStatus.created).json(result);
}

export async function signInHandler(req: Request, res: Response): Promise<void> {
  const result = await signIn(req.body as SignInInput);
  res.status(HttpStatus.ok).json(result);
}

export async function authHandler(req: Request, res: Response): Promise<void> {
  const user = await getAuthenticatedUser(requireEmail(req));
  res.status(HttpStatus.ok).json({ user });
}

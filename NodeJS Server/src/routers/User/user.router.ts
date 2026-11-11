import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { validate } from "../../middlewares/validate";
import { routing } from "../routing";
import { authHandler, signInHandler, signUpHandler } from "./user.controller";
import { signInSchema, signUpSchema } from "./user.schema";

const userRouter = Router();

userRouter.post(routing.user.signUp, validate(signUpSchema), signUpHandler);
userRouter.post(routing.user.signIn, validate(signInSchema), signInHandler);
userRouter.get(routing.user.auth, authenticate, authHandler);

export default userRouter;

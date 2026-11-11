import { z } from "zod";
import { ErrorMessage, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../../constants";
import { EMAIL_REGEX, NAME_REGEX } from "../../constants/regex";

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, ErrorMessage.passwordLength)
  .max(PASSWORD_MAX_LENGTH, ErrorMessage.passwordLength);

export const signUpSchema = z
  .object({
    email: z.string().trim().toLowerCase().regex(EMAIL_REGEX, ErrorMessage.invalidEmail),
    name: z.string().trim().regex(NAME_REGEX, ErrorMessage.invalidName),
    password: passwordSchema,
    rpassword: passwordSchema,
  })
  .refine((value) => value.password === value.rpassword, {
    message: ErrorMessage.passwordMismatch,
    path: ["rpassword"],
  });

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().regex(EMAIL_REGEX, ErrorMessage.invalidEmail),
  password: passwordSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

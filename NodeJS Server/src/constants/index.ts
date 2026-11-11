export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 12;
export const BCRYPT_SALT_ROUNDS = 12;

export const HttpStatus = {
  ok: 200,
  created: 201,
  badRequest: 400,
  unauthorized: 401,
  notFound: 404,
  conflict: 409,
  internal: 500,
  unavailable: 503,
} as const;

export const ErrorMessage = {
  internal: "Internal server error",
  emailTaken: "Email already registered",
  invalidCredentials: "Invalid email or password",
  authRequired: "Authentication required",
  invalidToken: "Invalid or expired token",
  invalidRequest: "Invalid request",
  invalidEmail: "A valid email is required",
  invalidName: "Name must be more than 2 letters and contain only letters",
  passwordLength: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`,
  passwordMismatch: "Passwords do not match",
  invalidCategory: "A valid course category is required",
  subjectOrTopicNotFound: "Subject or topic was not found",
  tutorNotConfigured: "Tutor is not configured",
  tutorFailed: "The tutor could not reply",
  sessionNotFound: "Classroom was not found",
  emptyMessage: "Write, talk, or draw something first",
} as const;

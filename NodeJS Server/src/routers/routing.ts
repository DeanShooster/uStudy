export const routing = {
  user: {
    base: "/",
    signUp: "/sign-up",
    signIn: "/sign-in",
    auth: "/auth",
  },
  course: {
    base: "/",
    categories: "/courses/categories",
    byCategory: "/courses/:category",
    complete: "/courses/complete/:name",
    remove: "/courses/remove/:name",
  },
  classroom: {
    base: "/",
    sessions: "/classroom/sessions",
    message: "/classroom/sessions/:id/messages",
    speech: "/classroom/speech",
    transcribe: "/classroom/transcribe",
  },
} as const;

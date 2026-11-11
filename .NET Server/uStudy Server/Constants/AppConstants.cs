using System.Text.RegularExpressions;

namespace uStudy_Server.Constants;

public static class AppConstants
{
    public const int PasswordMinLength = 6;
    public const int PasswordMaxLength = 12;
    public const int BcryptSaltRounds = 12;
    public const int CompletedProgress = 100;
    public const int HistoryLimit = 20;
    public const int MaxJsonChars = 2_500_000;
    public const long MaxBodyBytes = 3 * 1024 * 1024;

    public static readonly string[] CourseCategories =
    [
        "Math",
        "Language",
        "Chemistry",
        "Computer Science",
        "Physics",
        "Geography",
        "History",
        "Biology",
    ];
}

public static class ErrorMessages
{
    public const string Internal = "Internal server error";
    public const string EmailTaken = "Email already registered";
    public const string InvalidCredentials = "Invalid email or password";
    public const string AuthRequired = "Authentication required";
    public const string InvalidToken = "Invalid or expired token";
    public const string InvalidRequest = "Invalid request";
    public const string InvalidEmail = "A valid email is required";
    public const string InvalidName = "Name must be more than 2 letters and contain only letters";
    public const string PasswordLength = "Password must be between 6 and 12 characters";
    public const string PasswordMismatch = "Passwords do not match";
    public const string InvalidCategory = "A valid course category is required";
    public const string SubjectOrTopicNotFound = "Subject or topic was not found";
    public const string TutorNotConfigured = "Tutor is not configured";
    public const string TutorFailed = "The tutor could not reply";
    public const string SessionNotFound = "Classroom was not found";
    public const string EmptyMessage = "Write, talk, or draw something first";
    public const string MissingSecret = "Missing required environment variable: SECRET";
    public const string MissingDatabase = "Missing required environment variable: DB_KEY_NAME";
}

public static class Patterns
{
    public static readonly Regex Email = new(@"^[^\s@]+@[^\s@]+\.[^\s@]+$", RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.ECMAScript);
    public static readonly Regex Name = new(@"^[A-Za-z]{3,}$", RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.ECMAScript);
    public static readonly Regex SessionId = new(@"^[a-f\d]{24}$", RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.ECMAScript);
    public static readonly Regex AudioData = new(@"^data:(audio/[\w.+-]+)(?:;[^,]*)?;base64,([\s\S]+)$", RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.ECMAScript);
    public static readonly Regex Bullet = new(@"^[-*]\s*", RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.ECMAScript);
    public static readonly Regex Plain = new(@"[$`*#]", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    public static readonly Regex LeadingSpace = new(@"^\s+", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    public static readonly Regex Phase = new(@"\b(greet|teach|riddle|done)\b", RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.ECMAScript);
    public static readonly Regex Progress = new(@"\b(\d{1,3})\b", RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.ECMAScript);
    public static readonly Regex SampleRate = new(@"rate=(\d+)", RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
}

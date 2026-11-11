using System.Text.Json;
using System.Text.Json.Serialization;
using uStudy_Server.Constants;
using uStudy_Server.Contracts;
using uStudy_Server.Errors;

namespace uStudy_Server.Validation;

public sealed record SignUpInput(string Email, string Name, string Password);

public sealed record SignInInput(string Email, string Password);

public sealed record MessageInput(string Text, string? Image, string Source);

public static class RequestValidation
{
    static readonly JsonSerializerOptions BodyJson = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static SignUpInput SignUp(SignUpBody? body) => SignUp(ToElement(body));

    public static SignInInput SignIn(SignInBody? body) => SignIn(ToElement(body));

    public static string Topic(TopicBody? body) => Topic(ToElement(body));

    public static string Speech(SpeechBody? body) => Speech(ToElement(body));

    public static string Audio(TranscribeBody? body) => Audio(ToElement(body));

    public static MessageInput Message(MessageBody? body) => Message(ToElement(body));

    static JsonElement ToElement<T>(T? body) =>
        body is null ? default : JsonSerializer.SerializeToElement(body, BodyJson);

    static SignUpInput SignUp(JsonElement body)
    {
        var email = Email(body);
        var name = Name(body);
        var password = Password(body, "password");
        var repeat = Password(body, "rpassword");
        if (!string.Equals(password, repeat, StringComparison.Ordinal))
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.PasswordMismatch);
        }

        return new SignUpInput(email, name, password);
    }

    static SignInInput SignIn(JsonElement body) =>
        new(Email(body), Password(body, "password"));

    static string Topic(JsonElement body)
    {
        var topic = Text(body, "topic", required: true);
        if (topic.Length is < 1 or > 200)
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidRequest);
        }

        return topic;
    }

    static string Speech(JsonElement body)
    {
        var text = Text(body, "text", required: true);
        if (text.Length is < 1 or > 4000)
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidRequest);
        }

        return text;
    }

    static string Audio(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("audio", out var value) || value.ValueKind != JsonValueKind.String)
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidRequest);
        }

        var audio = value.GetString()!.Trim();
        if (audio.Length is < 1 or > AppConstants.MaxJsonChars || !audio.StartsWith("data:audio/", StringComparison.Ordinal))
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidRequest);
        }

        return audio;
    }

    static MessageInput Message(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("source", out var sourceValue) || sourceValue.ValueKind != JsonValueKind.String)
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidRequest);
        }

        var source = sourceValue.GetString() ?? "";
        if (source is not ("text" or "voice" or "start" or "board" or "continue"))
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidRequest);
        }

        var text = OptionalText(body, "text", 4000);
        var image = OptionalImage(body);
        var accepted = source switch
        {
            "start" or "continue" => true,
            "board" => image is not null,
            _ => text.Length > 0 || image is not null,
        };
        if (!accepted)
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.EmptyMessage);
        }

        return new MessageInput(text, image, source);
    }

    public static string Category(string category)
    {
        if (!AppConstants.CourseCategories.Contains(category, StringComparer.Ordinal))
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidCategory);
        }

        return category;
    }

    public static string ProgressName(string name)
    {
        var trimmed = name.Trim();
        if (trimmed.Length == 0)
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidRequest);
        }

        return trimmed;
    }

    public static string SessionId(string id)
    {
        if (!Patterns.SessionId.IsMatch(id))
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.SessionNotFound);
        }

        return id;
    }

    static string Email(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("email", out var value) || value.ValueKind != JsonValueKind.String)
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidEmail);
        }

        var email = value.GetString()!.Trim().ToLowerInvariant();
        if (!Patterns.Email.IsMatch(email))
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidEmail);
        }

        return email;
    }

    static string Name(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("name", out var value) || value.ValueKind != JsonValueKind.String)
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidName);
        }

        var name = value.GetString()!.Trim();
        if (!Patterns.Name.IsMatch(name))
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidName);
        }

        return name;
    }

    static string Password(JsonElement body, string property)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.String)
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.PasswordLength);
        }

        var password = value.GetString() ?? "";
        if (password.Length < AppConstants.PasswordMinLength || password.Length > AppConstants.PasswordMaxLength)
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.PasswordLength);
        }

        return password;
    }

    static string Text(JsonElement body, string property, bool required)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.String)
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidRequest);
        }

        var text = value.GetString()!.Trim();
        if (required && text.Length == 0)
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidRequest);
        }

        return text;
    }

    static string OptionalText(JsonElement body, string property, int max)
    {
        if (!body.TryGetProperty(property, out var value) || value.ValueKind is JsonValueKind.Undefined)
        {
            return "";
        }

        if (value.ValueKind != JsonValueKind.String)
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidRequest);
        }

        var text = value.GetString()!.Trim();
        if (text.Length > max)
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidRequest);
        }

        return text;
    }

    static string? OptionalImage(JsonElement body)
    {
        if (!body.TryGetProperty("image", out var value) || value.ValueKind is JsonValueKind.Undefined)
        {
            return null;
        }

        if (value.ValueKind != JsonValueKind.String)
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidRequest);
        }

        var image = value.GetString()!.Trim();
        if (image.Length > AppConstants.MaxJsonChars || !image.StartsWith("data:image/jpeg;base64,", StringComparison.Ordinal))
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidRequest);
        }

        return image;
    }
}

using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using uStudy_Server.Configuration;
using uStudy_Server.Constants;
using uStudy_Server.Errors;

namespace uStudy_Server.Auth;

public sealed class TokenService(ServerConfig config)
{
    const string Header = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";

    public string Create(string email)
    {
        var payload = new JsonObject
        {
            ["email"] = email,
            ["iat"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
        };
        var body = Base64Url(Encoding.UTF8.GetBytes(payload.ToJsonString()));
        var unsigned = $"{Header}.{body}";
        var signature = Base64Url(Sign(unsigned));
        return $"{unsigned}.{signature}";
    }

    public string ReadEmail(string token)
    {
        var parts = token.Split('.');
        if (parts.Length != 3 || parts[0] != Header)
        {
            throw new AppException(StatusCodes.Status401Unauthorized, ErrorMessages.InvalidToken);
        }

        byte[] actual;
        byte[] expected;
        try
        {
            actual = Base64UrlDecode(parts[2]);
            expected = Sign($"{parts[0]}.{parts[1]}");
        }
        catch (FormatException)
        {
            throw new AppException(StatusCodes.Status401Unauthorized, ErrorMessages.InvalidToken);
        }

        if (!CryptographicOperations.FixedTimeEquals(actual, expected))
        {
            throw new AppException(StatusCodes.Status401Unauthorized, ErrorMessages.InvalidToken);
        }

        JsonNode? payload;
        try
        {
            payload = JsonNode.Parse(Encoding.UTF8.GetString(Base64UrlDecode(parts[1])));
        }
        catch (Exception exception) when (exception is FormatException or System.Text.Json.JsonException)
        {
            throw new AppException(StatusCodes.Status401Unauthorized, ErrorMessages.InvalidToken);
        }

        if (payload?["email"]?.GetValue<string>() is not string email || email.Length == 0)
        {
            throw new AppException(StatusCodes.Status401Unauthorized, ErrorMessages.InvalidToken);
        }

        return email;
    }

    byte[] Sign(string value)
    {
        if (string.IsNullOrEmpty(config.Secret))
        {
            throw new AppException(StatusCodes.Status500InternalServerError, ErrorMessages.MissingSecret);
        }

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(config.Secret));
        return hmac.ComputeHash(Encoding.UTF8.GetBytes(value));
    }

    static string Base64Url(byte[] data) =>
        Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    static byte[] Base64UrlDecode(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded = (padded.Length % 4) switch
        {
            2 => padded + "==",
            3 => padded + "=",
            0 => padded,
            _ => throw new FormatException("Invalid token."),
        };
        return Convert.FromBase64String(padded);
    }
}

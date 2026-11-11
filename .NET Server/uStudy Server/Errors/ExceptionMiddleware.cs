using System.Text.Json;
using MongoDB.Driver;
using uStudy_Server.Constants;

namespace uStudy_Server.Errors;

public sealed class ExceptionMiddleware(RequestDelegate next, ILogger<ExceptionMiddleware> logger)
{
    static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public async Task Invoke(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception exception)
        {
            if (context.Response.HasStarted)
            {
                logger.LogError(exception, "Request failed after the response started");
                return;
            }

            var (status, message) = Map(exception);
            if (status >= StatusCodes.Status500InternalServerError)
            {
                logger.LogError(exception, "Request failed");
            }

            context.Response.StatusCode = status;
            await context.Response.WriteAsJsonAsync(new { message }, JsonOptions, context.RequestAborted);
        }
    }

    static (int Status, string Message) Map(Exception exception)
    {
        if (exception is AppException app)
        {
            return (app.StatusCode, app.Message);
        }

        if (exception is BadHttpRequestException bad)
        {
            return (bad.StatusCode, ErrorMessages.InvalidRequest);
        }

        if (exception is JsonException)
        {
            return (StatusCodes.Status400BadRequest, ErrorMessages.InvalidRequest);
        }

        if (IsDuplicateKey(exception))
        {
            return (StatusCodes.Status409Conflict, ErrorMessages.EmailTaken);
        }

        return (StatusCodes.Status500InternalServerError, ErrorMessages.Internal);
    }

    static bool IsDuplicateKey(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is MongoWriteException write && write.WriteError.Code == 11000)
            {
                return true;
            }

            if (current.Message.Contains("E11000", StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }
}

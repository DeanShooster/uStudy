using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using uStudy_Server.Constants;
using uStudy_Server.Errors;

namespace uStudy_Server.Auth;

public sealed class AuthenticationFilter(TokenService tokens) : IAsyncActionFilter
{
    public const string EmailItem = "UserEmail";

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (!context.ActionDescriptor.EndpointMetadata.OfType<RequireAuthAttribute>().Any())
        {
            await next();
            return;
        }

        var header = context.HttpContext.Request.Headers.Authorization.ToString();
        if (!header.StartsWith("Bearer ", StringComparison.Ordinal))
        {
            context.Result = Json(StatusCodes.Status401Unauthorized, ErrorMessages.AuthRequired);
            return;
        }

        try
        {
            context.HttpContext.Items[EmailItem] = tokens.ReadEmail(header["Bearer ".Length..]);
        }
        catch (AppException exception)
        {
            context.Result = Json(exception.StatusCode, exception.Message);
            return;
        }
        catch
        {
            context.Result = Json(StatusCodes.Status401Unauthorized, ErrorMessages.InvalidToken);
            return;
        }

        await next();
    }

    static JsonResult Json(int status, string message) =>
        new(new { message }) { StatusCode = status };
}

public static class AuthHttpContext
{
    public static string RequireEmail(this HttpContext context)
    {
        if (context.Items[AuthenticationFilter.EmailItem] is string email && email.Length > 0)
        {
            return email;
        }

        throw new AppException(StatusCodes.Status401Unauthorized, ErrorMessages.AuthRequired);
    }
}

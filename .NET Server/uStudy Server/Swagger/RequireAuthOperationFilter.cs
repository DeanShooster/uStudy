using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;
using uStudy_Server.Auth;

namespace uStudy_Server.Swagger;

public sealed class RequireAuthOperationFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        if (!RequireAuthAttribute.AppliesTo(context.MethodInfo))
        {
            return;
        }

        operation.Security ??= [];
        operation.Security.Add(new OpenApiSecurityRequirement
        {
            [new OpenApiSecuritySchemeReference("Bearer", context.Document)] = [],
        });
    }
}

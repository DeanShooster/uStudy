using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;
using uStudy_Server.Auth;
using uStudy_Server.Contracts;

namespace uStudy_Server.Swagger;

public sealed class ErrorResponseOperationFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        var schema = context.SchemaGenerator.GenerateSchema(typeof(ErrorResponse), context.SchemaRepository);
        var path = context.ApiDescription.RelativePath ?? "";
        var hasAuth = RequireAuthAttribute.AppliesTo(context.MethodInfo);

        if (HasInput(context))
        {
            Add(operation, "400", "Invalid request", schema);
        }

        if (hasAuth)
        {
            Add(operation, "401", "Authentication required", schema);
        }

        if (path == "sign-up")
        {
            Add(operation, "409", "Email already registered", schema);
        }

        if (path is "courses/complete/{name}" or "courses/remove/{name}" or "classroom/sessions/{id}/messages")
        {
            Add(operation, "404", "Not found", schema);
        }

        if (path is "classroom/speech" or "classroom/transcribe" or "classroom/sessions/{id}/messages")
        {
            Add(operation, "503", "Tutor is unavailable", schema);
        }

        if (path is "sign-up" or "classroom/sessions" && operation.Responses?.Remove("200", out var created) == true)
        {
            created.Description = "Created";
            operation.Responses["201"] = created;
        }
    }

    static bool HasInput(OperationFilterContext context) =>
        context.MethodInfo.GetParameters().Any(parameter => parameter.ParameterType != typeof(CancellationToken));

    static void Add(OpenApiOperation operation, string status, string description, IOpenApiSchema schema)
    {
        operation.Responses ??= new OpenApiResponses();
        if (operation.Responses.ContainsKey(status))
        {
            return;
        }

        operation.Responses.Add(status, new OpenApiResponse
        {
            Description = description,
            Content = new Dictionary<string, IOpenApiMediaType>
            {
                ["application/json"] = new OpenApiMediaType { Schema = schema },
            },
        });
    }
}

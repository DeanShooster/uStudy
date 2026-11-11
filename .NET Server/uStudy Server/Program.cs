using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Server.IIS;
using Microsoft.OpenApi;
using uStudy_Server.Auth;
using uStudy_Server.Configuration;
using uStudy_Server.Constants;
using uStudy_Server.Data;
using uStudy_Server.Errors;
using uStudy_Server.Services;
using uStudy_Server.Swagger;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = AppConstants.MaxBodyBytes;
    options.Limits.MinResponseDataRate = null;
});

builder.Services.Configure<IISServerOptions>(options =>
{
    options.MaxRequestBodySize = AppConstants.MaxBodyBytes;
});

var config = ServerConfig.From(builder.Configuration);
builder.Services.AddSingleton(config);
builder.Services.AddSingleton<AppDatabase>();
builder.Services.AddSingleton<TokenService>();
builder.Services.AddSingleton<CourseService>();
builder.Services.AddSingleton<UserService>();
builder.Services.AddSingleton<ClassroomService>();
builder.Services.AddSingleton<AuthenticationFilter>();
builder.Services.AddHttpClient("tutor", client => client.Timeout = TimeSpan.FromMinutes(3));

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

builder.Services.AddControllers(options => options.Filters.AddService<AuthenticationFilter>());
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = _ =>
        new JsonResult(new { message = ErrorMessages.InvalidRequest })
        {
            StatusCode = StatusCodes.Status400BadRequest,
        };
});
builder.Services.Configure<JsonOptions>(options =>
{
    options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "uStudy",
        Version = "v1",
    });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "Token returned by sign-up or sign-in.",
    });
    options.OperationFilter<RequireAuthOperationFilter>();
    options.OperationFilter<ErrorResponseOperationFilter>();
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "uStudy");
        options.DocumentTitle = "uStudy";
    });
}

app.UseMiddleware<ExceptionMiddleware>();
app.UseCors();
app.MapControllers();

app.Lifetime.ApplicationStarted.Register(() =>
{
    var addresses = app.Services
        .GetRequiredService<Microsoft.AspNetCore.Hosting.Server.IServer>()
        .Features.Get<Microsoft.AspNetCore.Hosting.Server.Features.IServerAddressesFeature>();

    if (addresses is null || addresses.Addresses.Count == 0)
    {
        Console.WriteLine("Server is online");
    }
    else
    {
        foreach (var address in addresses.Addresses)
        {
            Console.WriteLine($"Server is online on {address}");
        }
    }

    _ = Task.Run(async () =>
    {
        try
        {
            await app.Services.GetRequiredService<AppDatabase>().Ping(CancellationToken.None);
            Console.WriteLine("Database connection established successfully");
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"Database connection error: {exception.GetType().Name}");
        }
    });
});

app.Run();

using Microsoft.AspNetCore.Mvc;
using uStudy_Server.Auth;
using uStudy_Server.Contracts;
using uStudy_Server.Services;
using uStudy_Server.Validation;

namespace uStudy_Server.Controllers;

[ApiController]
[Route("")]
public sealed class UserController(UserService users) : ControllerBase
{
    [HttpPost("sign-up")]
    public async Task<ActionResult<AuthResult>> SignUp([FromBody] SignUpBody body)
    {
        var result = await users.SignUp(RequestValidation.SignUp(body));
        return StatusCode(StatusCodes.Status201Created, result);
    }

    [HttpPost("sign-in")]
    public async Task<ActionResult<AuthResult>> SignIn([FromBody] SignInBody body) =>
        Ok(await users.SignIn(RequestValidation.SignIn(body)));

    [HttpGet("auth")]
    [RequireAuth]
    public async Task<ActionResult<UserResponse>> Auth()
    {
        var user = await users.GetAuthenticatedUser(HttpContext.RequireEmail());
        return Ok(new UserResponse(user));
    }
}

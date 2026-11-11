using Microsoft.AspNetCore.Mvc;
using uStudy_Server.Auth;
using uStudy_Server.Contracts;
using uStudy_Server.Services;
using uStudy_Server.Validation;

namespace uStudy_Server.Controllers;

[ApiController]
[Route("")]
[RequireAuth]
public sealed class CourseController(CourseService courses, UserService users) : ControllerBase
{
    [HttpGet("courses/categories")]
    public ActionResult<CategoriesResponse> Categories() => Ok(new CategoriesResponse(courses.Categories()));

    [HttpGet("courses/{category}")]
    public async Task<ActionResult<CoursesResponse>> ByCategory(string category) =>
        Ok(new CoursesResponse(await courses.ByCategory(RequestValidation.Category(category))));

    [HttpPost("courses/complete/{name}")]
    public async Task<ActionResult<TopicsResponse>> Complete(string name)
    {
        var user = await courses.CompleteByName(HttpContext.RequireEmail(), RequestValidation.ProgressName(name));
        return Ok(new TopicsResponse(await users.ToPublicTopics(user)));
    }

    [HttpDelete("courses/remove/{name}")]
    public async Task<ActionResult<TopicsResponse>> Remove(string name)
    {
        var user = await courses.RemoveByName(HttpContext.RequireEmail(), RequestValidation.ProgressName(name));
        return Ok(new TopicsResponse(await users.ToPublicTopics(user)));
    }
}

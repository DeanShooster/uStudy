using Microsoft.AspNetCore.Mvc;
using uStudy_Server.Auth;
using uStudy_Server.Contracts;
using uStudy_Server.Services;
using uStudy_Server.Validation;

namespace uStudy_Server.Controllers;

[ApiController]
[Route("")]
[RequireAuth]
public sealed class ClassroomController(ClassroomService classroom) : ControllerBase
{
    [HttpPost("classroom/sessions")]
    public async Task<ActionResult<SessionResponse>> Create([FromBody] TopicBody body)
    {
        var session = await classroom.CreateSession(HttpContext.RequireEmail(), RequestValidation.Topic(body));
        return StatusCode(StatusCodes.Status201Created, new SessionResponse(session));
    }

    [HttpPost("classroom/speech")]
    [Produces("audio/wav")]
    public async Task<IActionResult> Speech([FromBody] SpeechBody body)
    {
        _ = HttpContext.RequireEmail();
        var audio = await classroom.SynthesizeSpeech(RequestValidation.Speech(body));
        Response.Headers.CacheControl = "no-store";
        return File(audio, "audio/wav");
    }

    [HttpPost("classroom/transcribe")]
    public async Task<ActionResult<TranscriptResponse>> Transcribe([FromBody] TranscribeBody body)
    {
        _ = HttpContext.RequireEmail();
        var text = await classroom.TranscribeSpeech(RequestValidation.Audio(body));
        return Ok(new TranscriptResponse(text));
    }

    [HttpPost("classroom/sessions/{id}/messages")]
    [Produces("text/event-stream")]
    public async Task Message(string id, [FromBody] MessageBody body, CancellationToken cancellationToken)
    {
        await classroom.StreamMessage(
            HttpContext.RequireEmail(),
            RequestValidation.SessionId(id),
            RequestValidation.Message(body),
            Response,
            cancellationToken);
    }
}

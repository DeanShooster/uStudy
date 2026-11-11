using System.ComponentModel;

namespace uStudy_Server.Contracts;

public sealed class SignUpBody
{
    public string? Email { get; set; }

    public string? Name { get; set; }

    public string? Password { get; set; }

    public string? Rpassword { get; set; }
}

public sealed class SignInBody
{
    public string? Email { get; set; }

    public string? Password { get; set; }
}

public sealed class TopicBody
{
    public string? Topic { get; set; }
}

public sealed class SpeechBody
{
    public string? Text { get; set; }
}

public sealed class TranscribeBody
{
    [Description("A data URL that starts with data:audio/.")]
    public string? Audio { get; set; }
}

public sealed class MessageBody
{
    public string? Text { get; set; }

    [Description("A JPEG data URL: data:image/jpeg;base64,...")]
    public string? Image { get; set; }

    [Description("text, voice, start, board, or continue")]
    public string? Source { get; set; }
}

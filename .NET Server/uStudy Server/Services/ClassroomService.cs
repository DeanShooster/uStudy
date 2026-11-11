using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Buffers.Binary;
using Microsoft.AspNetCore.Http.Features;
using MongoDB.Bson;
using MongoDB.Driver;
using uStudy_Server.Configuration;
using uStudy_Server.Constants;
using uStudy_Server.Contracts;
using uStudy_Server.Data;
using uStudy_Server.Errors;
using uStudy_Server.Validation;

namespace uStudy_Server.Services;

public sealed class ClassroomService(
    AppDatabase database,
    CourseService courses,
    ServerConfig config,
    IHttpClientFactory httpClientFactory,
    ILogger<ClassroomService> logger)
{
    const string SayMarker = "<<say>>";
    const string BoardMarker = "<<board>>";
    const string PhaseMarker = "<<phase>>";
    const string ProgressMarker = "<<progress>>";

    static readonly JsonSerializerOptions EventJson = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    static readonly string[] TtsModels = ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-2.5-flash-tts"];

    public async Task<ClassroomSession> CreateSession(string email, string topic)
    {
        var user = await database.RequireUser(email);
        var now = DateTime.UtcNow;
        var session = new SessionDocument
        {
            Id = ObjectId.GenerateNewId(),
            User = user.Id,
            Topic = topic,
            Phase = "greet",
            Messages = [],
            CreatedAt = now,
            UpdatedAt = now,
        };
        await database.Sessions.InsertOneAsync(session);
        return new ClassroomSession(session.Id.ToString(), session.Topic);
    }

    public async Task<byte[]> SynthesizeSpeech(string text)
    {
        var key = RequireTutorKey();
        var voice = string.IsNullOrWhiteSpace(config.OpenAiTtsVoice) ? "Kore" : config.OpenAiTtsVoice.Trim();
        var client = httpClientFactory.CreateClient("tutor");

        foreach (var model in SpeechModels())
        {
            using var response = await RequestAudio(client, model, text, voice, key);
            if (!response.IsSuccessStatusCode)
            {
                var detail = await response.Content.ReadAsStringAsync();
                logger.LogError("Tutor speech failed {Model} {Status} {Detail}", model, (int)response.StatusCode, detail.Length <= 180 ? detail : detail[..180]);
                if (response.StatusCode is System.Net.HttpStatusCode.TooManyRequests or System.Net.HttpStatusCode.NotFound or System.Net.HttpStatusCode.ServiceUnavailable)
                {
                    continue;
                }

                break;
            }

            var audio = WalkAudio(JsonNode.Parse(await response.Content.ReadAsStringAsync()));
            if (audio is null)
            {
                continue;
            }

            return ToWav(Convert.FromBase64String(audio.Value.Data), audio.Value.Mime);
        }

        throw new AppException(StatusCodes.Status503ServiceUnavailable, ErrorMessages.TutorFailed);
    }

    public async Task<string> TranscribeSpeech(string audio)
    {
        var key = RequireTutorKey();
        var match = Patterns.AudioData.Match(audio);
        if (!match.Success)
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.InvalidRequest);
        }

        var model = string.IsNullOrWhiteSpace(config.OpenAiModel) ? "gemini-3.5-flash-lite" : config.OpenAiModel;
        var body = new JsonObject
        {
            ["contents"] = new JsonArray
            {
                new JsonObject
                {
                    ["role"] = "user",
                    ["parts"] = new JsonArray
                    {
                        new JsonObject
                        {
                            ["text"] = "Transcribe the speech in this audio. If there is no clear speech, reply with exactly NONE. Otherwise reply with only the words that were spoken.",
                        },
                        new JsonObject
                        {
                            ["inlineData"] = new JsonObject
                            {
                                ["mimeType"] = match.Groups[1].Value,
                                ["data"] = match.Groups[2].Value,
                            },
                        },
                    },
                },
            },
        };

        var client = httpClientFactory.CreateClient("tutor");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{GeminiRoot()}/models/{Uri.EscapeDataString(model)}:generateContent");
        request.Headers.TryAddWithoutValidation("x-goog-api-key", key);
        request.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");
        using var response = await client.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            var detail = await response.Content.ReadAsStringAsync();
            logger.LogError("Tutor transcription failed {Status} {Detail}", (int)response.StatusCode, detail.Length <= 240 ? detail : detail[..240]);
            throw new AppException(StatusCodes.Status503ServiceUnavailable, ErrorMessages.TutorFailed);
        }

        return ReadTranscript(JsonNode.Parse(await response.Content.ReadAsStringAsync()));
    }

    public async Task StreamMessage(string email, string id, MessageInput input, HttpResponse response, CancellationToken cancellationToken)
    {
        RequireTutorKey();
        var user = await database.RequireUser(email);
        if (!ObjectId.TryParse(id, out var sessionId))
        {
            throw new AppException(StatusCodes.Status400BadRequest, ErrorMessages.SessionNotFound);
        }

        var session = await database.Sessions.Find(entry => entry.Id == sessionId && entry.User == user.Id).FirstOrDefaultAsync(cancellationToken);
        if (session is null)
        {
            throw new AppException(StatusCodes.Status404NotFound, ErrorMessages.SessionNotFound);
        }

        var opening = input.Source == "start";
        var watching = input.Source == "board";
        var continuing = input.Source == "continue";
        var phase = string.IsNullOrEmpty(session.Phase) ? "greet" : session.Phase;
        session.Messages ??= [];
        if (!opening && !watching && !continuing)
        {
            session.Messages.Add(new SessionMessage
            {
                Role = "user",
                Text = input.Text,
                Source = input.Source == "voice" ? "voice" : "text",
            });
            session.UpdatedAt = DateTime.UtcNow;
            await database.Sessions.ReplaceOneAsync(entry => entry.Id == session.Id, session, cancellationToken: cancellationToken);
        }

        response.StatusCode = StatusCodes.Status200OK;
        response.ContentType = "text/event-stream; charset=utf-8";
        response.Headers.CacheControl = "no-cache, no-transform";
        response.Headers["X-Accel-Buffering"] = "no";
        response.HttpContext.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();
        await response.StartAsync(cancellationToken);

        try
        {
            var speech = new LessonSpeech();
            var name = string.IsNullOrWhiteSpace(user.Name) ? "there" : user.Name.Trim();
            var currentProgress = await courses.ReadTopicProgress(email, session.Topic);
            await StreamCompletion(
                TutorMessages(session.Topic, name, phase, currentProgress, session.Messages, input.Image, watching, opening, continuing),
                token =>
                {
                    var delta = Plain(speech.Push(token));
                    if (delta.Length == 0 || cancellationToken.IsCancellationRequested)
                    {
                        return;
                    }

                    WriteEvent(response, new { text = delta }, cancellationToken).GetAwaiter().GetResult();
                },
                cancellationToken);

            if (cancellationToken.IsCancellationRequested)
            {
                return;
            }

            var lesson = speech.Finish();
            var say = Plain(lesson.Say).Trim();
            var pending = Plain(lesson.Pending);
            if (say.Length == 0 && !watching)
            {
                throw new InvalidOperationException(ErrorMessages.TutorFailed);
            }

            if (pending.Length > 0)
            {
                await WriteEvent(response, new { text = pending }, cancellationToken);
            }

            var nextPhase = lesson.Phase ?? phase;
            double? reported = nextPhase == "done" ? 100 : lesson.Progress;
            if (say.Length > 0 && reported is not null && (nextPhase == "done" || reported.Value > currentProgress))
            {
                var saved = await courses.SetTopicProgress(email, session.Topic, reported.Value);
                if (saved is not null)
                {
                    await WriteEvent(response, new { progress = saved }, cancellationToken);
                }
            }

            var keepWork = watching && nextPhase == "riddle";
            if (lesson.Board.Count > 0 && !keepWork)
            {
                await WriteEvent(response, new { board = lesson.Board }, cancellationToken);
            }

            await WriteEvent(response, new { phase = nextPhase }, cancellationToken);

            if (say.Length > 0)
            {
                if (watching)
                {
                    session.Messages.Add(new SessionMessage
                    {
                        Role = "user",
                        Text = "The student is writing on the board.",
                        Source = "board",
                    });
                }

                session.Messages.Add(new SessionMessage { Role = "assistant", Text = say });
            }

            session.Phase = nextPhase;
            session.UpdatedAt = DateTime.UtcNow;
            await database.Sessions.ReplaceOneAsync(entry => entry.Id == session.Id, session, cancellationToken: cancellationToken);

            if (!cancellationToken.IsCancellationRequested)
            {
                await WriteRaw(response, "data: [DONE]\n\n", cancellationToken);
            }
        }
        catch (Exception exception) when (cancellationToken.IsCancellationRequested || exception is IOException)
        {
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Tutor stream failed");
            if (!cancellationToken.IsCancellationRequested)
            {
                var message = exception is AppException app ? app.Message : ErrorMessages.TutorFailed;
                await WriteEvent(response, new { error = message }, CancellationToken.None);
            }
        }
    }

    string RequireTutorKey()
    {
        if (string.IsNullOrWhiteSpace(config.OpenAiApiKey))
        {
            throw new AppException(StatusCodes.Status503ServiceUnavailable, ErrorMessages.TutorNotConfigured);
        }

        return config.OpenAiApiKey;
    }

    IEnumerable<string> SpeechModels()
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var preferred = config.OpenAiTtsModel?.Trim();
        if (!string.IsNullOrEmpty(preferred) && seen.Add(preferred))
        {
            yield return preferred;
        }

        foreach (var model in TtsModels)
        {
            if (seen.Add(model))
            {
                yield return model;
            }
        }
    }

    async Task<HttpResponseMessage> RequestAudio(HttpClient client, string model, string text, string voice, string key)
    {
        var url = $"{GeminiRoot()}/models/{Uri.EscapeDataString(model)}:generateContent";
        JsonObject[] shapes =
        [
            new() { ["prebuiltVoiceConfig"] = new JsonObject { ["voiceName"] = voice } },
            new() { ["voice"] = voice },
        ];

        HttpResponseMessage? response = null;
        foreach (var voiceConfig in shapes)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.TryAddWithoutValidation("x-goog-api-key", key);
            var body = new JsonObject
            {
                ["contents"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["role"] = "user",
                        ["parts"] = new JsonArray { new JsonObject { ["text"] = text } },
                    },
                },
                ["generationConfig"] = new JsonObject
                {
                    ["responseModalities"] = new JsonArray { "AUDIO" },
                    ["speechConfig"] = new JsonObject { ["voiceConfig"] = voiceConfig },
                },
            };
            request.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");
            var next = await client.SendAsync(request);
            if (next.IsSuccessStatusCode || (int)next.StatusCode != StatusCodes.Status400BadRequest)
            {
                response?.Dispose();
                return next;
            }

            response?.Dispose();
            response = next;
        }

        return response ?? throw new AppException(StatusCodes.Status503ServiceUnavailable, ErrorMessages.TutorFailed);
    }

    async Task StreamCompletion(IReadOnlyList<ChatTurn> messages, Action<string> onToken, CancellationToken cancellationToken)
    {
        var key = RequireTutorKey();
        var body = new JsonObject
        {
            ["model"] = string.IsNullOrWhiteSpace(config.OpenAiModel) ? "gpt-4o-mini" : config.OpenAiModel,
            ["stream"] = true,
            ["temperature"] = 0.4,
            ["max_tokens"] = 800,
            ["messages"] = new JsonArray(messages.Select(message => (JsonNode)new JsonObject
            {
                ["role"] = message.Role,
                ["content"] = message.Content,
            }).ToArray()),
        };

        var client = httpClientFactory.CreateClient("tutor");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{ChatBase()}/chat/completions");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        request.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");

        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode || response.Content is null)
        {
            logger.LogError("Tutor request failed {Status}", (int)response.StatusCode);
            throw new InvalidOperationException(ErrorMessages.TutorFailed);
        }

        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);
        try
        {
            while (true)
            {
                var line = await reader.ReadLineAsync(cancellationToken);
                if (line is null)
                {
                    break;
                }

                var trimmed = line.Trim();
                if (!trimmed.StartsWith("data:", StringComparison.Ordinal))
                {
                    continue;
                }

                var data = trimmed[5..].Trim();
                if (data.Length == 0 || data == "[DONE]")
                {
                    continue;
                }

                JsonNode? payload;
                try
                {
                    payload = JsonNode.Parse(data);
                }
                catch (JsonException)
                {
                    continue;
                }

                var token = AsString(payload?["choices"]?[0]?["delta"]?["content"]);
                if (string.IsNullOrEmpty(token))
                {
                    continue;
                }

                onToken(token);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
    }

    string ChatBase() =>
        (string.IsNullOrWhiteSpace(config.OpenAiBaseUrl) ? "https://api.openai.com/v1" : config.OpenAiBaseUrl).TrimEnd('/');

    string GeminiRoot()
    {
        var baseUrl = (string.IsNullOrWhiteSpace(config.OpenAiBaseUrl)
            ? "https://generativelanguage.googleapis.com/v1beta/openai"
            : config.OpenAiBaseUrl).TrimEnd('/');
        const string suffix = "/openai";
        return baseUrl.EndsWith(suffix, StringComparison.Ordinal) ? baseUrl[..^suffix.Length] : baseUrl;
    }

    static List<ChatTurn> TutorMessages(
        string topic,
        string name,
        string phase,
        double progress,
        IReadOnlyList<SessionMessage> history,
        string? image,
        bool watching,
        bool opening,
        bool continuing)
    {
        var recent = history.TakeLast(AppConstants.HistoryLimit).ToList();
        var messages = new List<ChatTurn>
        {
            new("system", JsonValue.Create(LessonPrompt(topic, name, phase, progress, watching))!),
        };

        for (var index = 0; index < recent.Count; index++)
        {
            var message = recent[index];
            var latest = index == recent.Count - 1 && message.Role == "user";
            var text = message.Text.Trim();
            if (text.Length == 0 && latest && image is not null)
            {
                text = "The student sent their board.";
            }

            if (text.Length == 0)
            {
                continue;
            }

            if (message.Role == "assistant")
            {
                messages.Add(new ChatTurn("assistant", JsonValue.Create(text)!));
                continue;
            }

            if (latest && image is not null && !watching)
            {
                messages.Add(new ChatTurn("user", ImageContent(text, image)));
                continue;
            }

            messages.Add(new ChatTurn("user", JsonValue.Create(text)!));
        }

        if (opening)
        {
            messages.Add(new ChatTurn("user", JsonValue.Create($"The lesson is starting now. Greet {name} by name, name the topic, and ask if they are ready to begin.")!));
        }

        if (continuing)
        {
            messages.Add(new ChatTurn("user", JsonValue.Create("The student pressed Continue. They have nothing to say or write. Carry the lesson forward with the next paragraph.")!));
        }

        if (watching && image is not null)
        {
            messages.Add(new ChatTurn("user", ImageContent("The student is writing on the board now. Read their work.", image)));
        }

        return messages;
    }

    static string LessonPrompt(string topic, string name, string phase, double progress, bool watching) =>
        string.Join('\n',
        [
            $"You are the uStudy tutor sitting with {name}. The lesson topic is \"{topic}\".",
            "Teach one idea at a time, but say it as a full paragraph of about five to eight sentences. Walk through the logic so the student can follow the reason, not only the result.",
            "Do not stop after one sentence, and do not ask if they are ready or if it is clear after every step.",
            "Phases:",
            "- greet: say hello, use the student's name, say the topic name, and ask if they are ready. Do not teach yet. The board is only the topic name.",
            "- teach: one paragraph about one idea. The board must show one concrete example from this topic, such as an equation or a labeled fact. Never leave the board empty on a teach turn.",
            "- riddle: one paragraph that sets up a single problem, then ask them to write the answer on the board. The board shows the problem.",
            "When they say they are ready, or they press Continue, leave greet and teach the first paragraph.",
            "When they press Continue after a paragraph, teach the next idea or give one problem, never both in the same turn.",
            "When they press Continue during a problem, explain that solution in a paragraph, then move on.",
            "When they are confused, stay on the same idea and put a simpler example on the board.",
            "- done: the lesson is finished. Tell them they have completed this topic. Do not start a new idea.",
            $"Their progress on this topic is {progress.ToString(CultureInfo.InvariantCulture)} out of 100. Never lower it.",
            "Raise progress only for something they have now learned. A greeting stays put. One new idea raises it by about 20. A solved problem raises it further.",
            "When the main idea is understood and they have handled a problem, set phase to done and progress to 100.",
            watching
                ? "The student is writing an answer on the board right now. The image shows your writing and theirs. If the work is unfinished, say nothing. If there is a clear mistake, give one short hint and do not reveal the answer. If the answer is right, praise them and continue with the next paragraph."
                : "When an image is attached, it is the board. Read the student's writing and respond to it.",
            $"The lesson is currently in the {phase} phase.",
            "Reply in this exact shape and nothing else. Do not add a title or markdown.",
            SayMarker,
            "the words you speak, and nothing else in this part",
            BoardMarker,
            "one plain board line per line, or NONE",
            PhaseMarker,
            "one of: greet, teach, riddle, done",
            ProgressMarker,
            "an integer from 0 to 100",
            "Board lines are text the student can read, such as an equation or a short label. At most 6 lines.",
            "On the greeting, the board is only the topic name.",
            "While you are only hinting at work already on the board, the board part is NONE so their writing stays.",
        ]);

    static JsonArray ImageContent(string text, string image) =>
    [
        new JsonObject { ["type"] = "text", ["text"] = text },
        new JsonObject
        {
            ["type"] = "image_url",
            ["image_url"] = new JsonObject { ["url"] = image },
        },
    ];

    static async Task WriteEvent(HttpResponse response, object payload, CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(payload, EventJson);
        await WriteRaw(response, $"data: {json}\n\n", cancellationToken);
    }

    static async Task WriteRaw(HttpResponse response, string text, CancellationToken cancellationToken)
    {
        var bytes = Encoding.UTF8.GetBytes(text);
        await response.Body.WriteAsync(bytes, cancellationToken);
        await response.Body.FlushAsync(cancellationToken);
    }

    static string? AsString(JsonNode? node) =>
        node is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;

    static (string Data, string Mime)? WalkAudio(JsonNode? value, string key = "")
    {
        switch (value)
        {
            case null:
                return null;
            case JsonArray array:
                foreach (var item in array)
                {
                    var found = WalkAudio(item, key);
                    if (found is not null)
                    {
                        return found;
                    }
                }

                return null;
            case JsonObject record:
                var data = AsString(record["data"]);
                var mime = AsString(record["mime_type"]) ?? AsString(record["mimeType"]) ?? "";
                if (!string.IsNullOrEmpty(data) && data.Length > 100 && (mime.StartsWith("audio", StringComparison.Ordinal) || key.Contains("audio", StringComparison.OrdinalIgnoreCase) || key.Contains("inline", StringComparison.OrdinalIgnoreCase)))
                {
                    return (data, mime.Length == 0 ? "audio/wav" : mime);
                }

                foreach (var child in record)
                {
                    var found = WalkAudio(child.Value, child.Key);
                    if (found is not null)
                    {
                        return found;
                    }
                }

                return null;
            default:
                return null;
        }
    }

    static string ReadTranscript(JsonNode? payload)
    {
        if (payload?["candidates"]?[0]?["content"]?["parts"] is not JsonArray parts)
        {
            return "";
        }

        return string.Concat(parts.Select(part => AsString(part?["text"]) ?? "")).Trim();
    }

    static byte[] ToWav(byte[] bytes, string mime)
    {
        if (bytes.Length >= 4 && Encoding.ASCII.GetString(bytes, 0, 4) == "RIFF")
        {
            return bytes;
        }

        var rateMatch = Patterns.SampleRate.Match(mime);
        var rate = rateMatch.Success ? int.Parse(rateMatch.Groups[1].Value, CultureInfo.InvariantCulture) : 24000;
        var header = new byte[44];
        Encoding.ASCII.GetBytes("RIFF").CopyTo(header, 0);
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(4), 36u + (uint)bytes.Length);
        Encoding.ASCII.GetBytes("WAVE").CopyTo(header, 8);
        Encoding.ASCII.GetBytes("fmt ").CopyTo(header, 12);
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(16), 16);
        BinaryPrimitives.WriteUInt16LittleEndian(header.AsSpan(20), 1);
        BinaryPrimitives.WriteUInt16LittleEndian(header.AsSpan(22), 1);
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(24), (uint)rate);
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(28), (uint)(rate * 2));
        BinaryPrimitives.WriteUInt16LittleEndian(header.AsSpan(32), 2);
        BinaryPrimitives.WriteUInt16LittleEndian(header.AsSpan(34), 16);
        Encoding.ASCII.GetBytes("data").CopyTo(header, 36);
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(40), (uint)bytes.Length);
        var wav = new byte[header.Length + bytes.Length];
        header.CopyTo(wav, 0);
        bytes.CopyTo(wav, header.Length);
        return wav;
    }

    static string Plain(string text) => Patterns.Plain.Replace(text, "");

    static List<string> BoardLines(string raw)
    {
        var text = raw.Trim();
        if (text.Length == 0 || text.Equals("NONE", StringComparison.OrdinalIgnoreCase))
        {
            return [];
        }

        return text.Split('\n')
            .Select(line => Patterns.Bullet.Replace(line, "").Trim())
            .Where(line => line.Length > 0 && !line.Equals("NONE", StringComparison.OrdinalIgnoreCase))
            .Take(6)
            .Select(line =>
            {
                var plain = Plain(line);
                return plain.Length <= 80 ? plain : plain[..80];
            })
            .Where(line => line.Trim().Length > 0)
            .ToList();
    }

    static string? ReadPhase(string raw)
    {
        var match = Patterns.Phase.Match(raw);
        if (!match.Success)
        {
            return null;
        }

        var value = match.Groups[1].Value.ToLowerInvariant();
        return value is "greet" or "teach" or "riddle" or "done" ? value : null;
    }

    static double? ReadProgress(string raw)
    {
        var match = Patterns.Progress.Match(raw);
        if (!match.Success)
        {
            return null;
        }

        var value = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
        return value > 100 ? null : value;
    }

    sealed record ChatTurn(string Role, JsonNode Content);

    sealed record LessonDraft(string Say, string Pending, List<string> Board, string? Phase, double? Progress);

    sealed class LessonSpeech
    {
        string raw = "";
        int sent;

        public string Push(string token)
        {
            raw += token;
            var body = SayBody();
            if (body is null)
            {
                return "";
            }

            var closed = raw.Contains(BoardMarker, StringComparison.Ordinal);
            var safeLength = closed ? body.Length : Math.Max(0, body.Length - (BoardMarker.Length - 1));
            var delta = sent >= safeLength ? "" : body[sent..safeLength];
            sent = safeLength;
            return delta;
        }

        public LessonDraft Finish()
        {
            var body = SayBody();
            var say = (body ?? raw).Trim();
            var pendingRaw = body is null || sent > body.Length ? say : body[sent..];
            if (body is not null && sent > body.Length)
            {
                pendingRaw = "";
            }
            else if (body is null)
            {
                pendingRaw = say;
            }
            else
            {
                pendingRaw = body[sent..];
            }

            var pending = pendingRaw.Trim().Length > 0 ? pendingRaw : "";
            var boardStart = raw.IndexOf(BoardMarker, StringComparison.Ordinal);
            var phaseStart = raw.IndexOf(PhaseMarker, StringComparison.Ordinal);
            var progressStart = raw.IndexOf(ProgressMarker, StringComparison.Ordinal);
            return new LessonDraft(
                say,
                pending,
                body is null ? [] : BoardLines(Slice(raw, boardStart, BoardMarker, phaseStart)),
                body is null ? null : ReadPhase(Slice(raw, phaseStart, PhaseMarker, progressStart)),
                body is null ? null : ReadProgress(Slice(raw, progressStart, ProgressMarker, -1)));
        }

        string? SayBody()
        {
            var start = raw.IndexOf(SayMarker, StringComparison.Ordinal);
            if (start < 0)
            {
                return null;
            }

            var from = start + SayMarker.Length;
            var end = raw.IndexOf(BoardMarker, from, StringComparison.Ordinal);
            var slice = end < 0 ? raw[from..] : raw[from..end];
            return Patterns.LeadingSpace.Replace(slice, "");
        }

        static string Slice(string value, int markerStart, string marker, int nextMarker)
        {
            if (markerStart < 0)
            {
                return "";
            }

            var from = markerStart + marker.Length;
            if (from > value.Length)
            {
                return "";
            }

            if (nextMarker < 0)
            {
                return value[from..];
            }

            if (nextMarker < from)
            {
                return "";
            }

            return value[from..nextMarker];
        }
    }
}

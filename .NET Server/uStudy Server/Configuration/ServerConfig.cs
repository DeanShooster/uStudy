namespace uStudy_Server.Configuration;

public sealed record ServerConfig(
    string MongoUri,
    string? Secret,
    string? OpenAiApiKey,
    string? OpenAiBaseUrl,
    string? OpenAiModel,
    string? OpenAiTtsModel,
    string? OpenAiTtsVoice)
{
    public static ServerConfig From(IConfiguration configuration)
    {
        var file = EnvFile.Load();
        string? Read(string key)
        {
            var fromEnvironment = Environment.GetEnvironmentVariable(key);
            if (!string.IsNullOrWhiteSpace(fromEnvironment))
            {
                return fromEnvironment;
            }

            var fromSettings = configuration[key];
            if (!string.IsNullOrWhiteSpace(fromSettings))
            {
                return fromSettings;
            }

            return file.TryGetValue(key, out var fromFile) && !string.IsNullOrWhiteSpace(fromFile) ? fromFile : null;
        }

        var mongoUri = Read("DB_KEY_NAME") ?? throw new InvalidOperationException(Constants.ErrorMessages.MissingDatabase);
        return new ServerConfig(
            mongoUri,
            Read("SECRET"),
            Read("OPENAI_API_KEY"),
            Read("OPENAI_BASE_URL"),
            Read("OPENAI_MODEL"),
            Read("OPENAI_TTS_MODEL"),
            Read("OPENAI_TTS_VOICE"));
    }
}

static class EnvFile
{
    public static Dictionary<string, string> Load()
    {
        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
        {
            if (string.IsNullOrWhiteSpace(start))
            {
                continue;
            }

            var dir = new DirectoryInfo(start);
            for (var depth = 0; depth < 8 && dir is not null; depth++, dir = dir.Parent)
            {
                ReadIfExists(Path.Combine(dir.FullName, ".env"), values);
                ReadIfExists(Path.Combine(dir.FullName, "server nodejs", ".env"), values);
            }
        }

        return values;
    }

    static void ReadIfExists(string path, Dictionary<string, string> values)
    {
        if (!File.Exists(path))
        {
            return;
        }

        foreach (var raw in File.ReadAllLines(path))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#'))
            {
                continue;
            }

            var split = line.IndexOf('=');
            if (split <= 0)
            {
                continue;
            }

            var key = line[..split].Trim();
            var value = line[(split + 1)..].Trim();
            if (value.Length >= 2 && ((value[0] == '"' && value[^1] == '"') || (value[0] == '\'' && value[^1] == '\'')))
            {
                value = value[1..^1];
            }

            values.TryAdd(key, value);
        }
    }
}

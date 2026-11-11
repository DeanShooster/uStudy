using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace uStudy_Server.Data;

[BsonIgnoreExtraElements]
public sealed class UserDocument
{
    [BsonId]
    public ObjectId Id { get; set; }

    [BsonElement("name")]
    public string Name { get; set; } = "";

    [BsonElement("email")]
    public string Email { get; set; } = "";

    [BsonElement("password")]
    public string? Password { get; set; }

    [BsonElement("topics")]
    [BsonIgnoreIfNull]
    public List<UserTopicEntry>? Topics { get; set; }

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; }

    [BsonElement("updatedAt")]
    public DateTime UpdatedAt { get; set; }
}

[BsonIgnoreExtraElements]
public sealed class UserTopicEntry
{
    [BsonElement("topic")]
    [BsonSerializer(typeof(FlexibleObjectIdSerializer))]
    public ObjectId Topic { get; set; }

    [BsonElement("progress")]
    [BsonSerializer(typeof(FlexibleDoubleSerializer))]
    public double Progress { get; set; }
}

[BsonIgnoreExtraElements]
public sealed class CourseDocument
{
    [BsonId]
    public ObjectId Id { get; set; }

    [BsonElement("name")]
    public string Name { get; set; } = "";

    [BsonElement("category")]
    public string Category { get; set; } = "";

    [BsonElement("subjects")]
    [BsonIgnoreIfNull]
    public List<SubjectDocument>? Subjects { get; set; }

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; }

    [BsonElement("updatedAt")]
    public DateTime UpdatedAt { get; set; }
}

[BsonIgnoreExtraElements]
public sealed class SubjectDocument
{
    [BsonId]
    public ObjectId Id { get; set; }

    [BsonElement("name")]
    public string Name { get; set; } = "";

    [BsonElement("description")]
    public string Description { get; set; } = "";

    [BsonElement("topics")]
    [BsonIgnoreIfNull]
    public List<TopicDocument>? Topics { get; set; }
}

[BsonIgnoreExtraElements]
public sealed class TopicDocument
{
    [BsonId]
    public ObjectId Id { get; set; }

    [BsonElement("name")]
    public string Name { get; set; } = "";
}

[BsonIgnoreExtraElements]
public sealed class SessionDocument
{
    [BsonId]
    public ObjectId Id { get; set; }

    [BsonElement("user")]
    public ObjectId User { get; set; }

    [BsonElement("topic")]
    public string Topic { get; set; } = "";

    [BsonElement("phase")]
    public string Phase { get; set; } = "greet";

    [BsonElement("messages")]
    [BsonIgnoreIfNull]
    public List<SessionMessage>? Messages { get; set; }

    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; }

    [BsonElement("updatedAt")]
    public DateTime UpdatedAt { get; set; }
}

[BsonIgnoreExtraElements]
public sealed class SessionMessage
{
    [BsonElement("role")]
    public string Role { get; set; } = "";

    [BsonElement("text")]
    public string Text { get; set; } = "";

    [BsonElement("source")]
    [BsonIgnoreIfNull]
    public string? Source { get; set; }
}

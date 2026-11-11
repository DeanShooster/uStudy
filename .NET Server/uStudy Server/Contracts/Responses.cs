namespace uStudy_Server.Contracts;

public sealed record ErrorResponse(string Message);

public sealed record CategoriesResponse(IReadOnlyList<string> Categories);

public sealed record CoursesResponse(IReadOnlyList<CourseDto> Courses);

public sealed record TopicsResponse(IReadOnlyList<PublicTopic> Topics);

public sealed record UserResponse(PublicUser User);

public sealed record SessionResponse(ClassroomSession Session);

public sealed record TranscriptResponse(string Text);

public sealed record AuthResult(string Token, PublicUser User);

public sealed record PublicTopicName(string Name);

public sealed record PublicTopic(PublicTopicName Topic, int Progress);

public sealed record PublicUser(string Name, string Email, IReadOnlyList<PublicTopic> Topics);

public sealed record CourseTopicDto(string Name);

public sealed record CourseSubjectDto(string Name, string Description, IReadOnlyList<CourseTopicDto> Topics);

public sealed record CourseDto(string Name, string Category, IReadOnlyList<CourseSubjectDto> Subjects, string CreatedAt, string UpdatedAt);

public sealed record ClassroomSession(string Id, string Topic);

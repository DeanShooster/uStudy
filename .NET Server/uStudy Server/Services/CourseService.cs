using System.Globalization;
using MongoDB.Bson;
using MongoDB.Driver;
using uStudy_Server.Constants;
using uStudy_Server.Contracts;
using uStudy_Server.Data;
using uStudy_Server.Errors;

namespace uStudy_Server.Services;

public sealed class CourseService(AppDatabase database)
{
    public IReadOnlyList<string> Categories() => AppConstants.CourseCategories.ToArray();

    public async Task<IReadOnlyList<CourseDto>> ByCategory(string category)
    {
        var courses = await database.Courses.Find(course => course.Category == category).ToListAsync();
        return courses.Select(ToDto).ToArray();
    }

    public async Task<UserDocument> CompleteByName(string email, string name)
    {
        var result = await SaveTopicProgress(email, name, AppConstants.CompletedProgress, raise: false);
        if (result is null)
        {
            throw new AppException(StatusCodes.Status404NotFound, ErrorMessages.SubjectOrTopicNotFound);
        }

        return result.Value.User;
    }

    public async Task<UserDocument> RemoveByName(string email, string name)
    {
        var topicIds = await FindTopicIds(name);
        if (topicIds.Count == 0)
        {
            throw new AppException(StatusCodes.Status404NotFound, ErrorMessages.SubjectOrTopicNotFound);
        }

        var user = await database.RequireUser(email);
        var selected = topicIds.Select(id => id.ToString()).ToHashSet(StringComparer.Ordinal);
        user.Topics = (user.Topics ?? []).Where(entry => !selected.Contains(entry.Topic.ToString())).ToList();
        user.UpdatedAt = DateTime.UtcNow;
        await database.Users.ReplaceOneAsync(entry => entry.Id == user.Id, user);
        return user;
    }

    public async Task<double> ReadTopicProgress(string email, string name)
    {
        var topicIds = await FindTopicIds(name);
        if (topicIds.Count == 0)
        {
            return 0;
        }

        UserDocument user;
        try
        {
            user = await database.RequireUser(email);
        }
        catch (AppException exception) when (exception.StatusCode == StatusCodes.Status401Unauthorized)
        {
            return 0;
        }

        var selected = topicIds.Select(id => id.ToString()).ToHashSet(StringComparer.Ordinal);
        var values = (user.Topics ?? [])
            .Where(entry => selected.Contains(entry.Topic.ToString()))
            .Select(entry => entry.Progress)
            .ToArray();
        return values.Length == 0 ? 0 : values.Max();
    }

    public async Task<double?> SetTopicProgress(string email, string name, double progress)
    {
        var result = await SaveTopicProgress(email, name, progress, raise: true);
        return result?.Stored;
    }

    public async Task<Dictionary<string, string>> TopicNamesById()
    {
        var topics = await ListCourseTopics();
        return topics.ToDictionary(topic => topic.Id.ToString(), topic => topic.Name);
    }

    async Task<(UserDocument User, double Stored)?> SaveTopicProgress(string email, string name, double progress, bool raise)
    {
        var topicIds = await FindTopicIds(name);
        if (topicIds.Count == 0)
        {
            return null;
        }

        var next = Math.Min(AppConstants.CompletedProgress, Math.Max(0, Math.Round(progress)));
        var user = await database.RequireUser(email);
        var topics = (user.Topics ?? []).Select(entry => new UserTopicEntry { Topic = entry.Topic, Progress = entry.Progress }).ToList();
        var stored = next;

        foreach (var topicId in topicIds)
        {
            var existing = topics.FirstOrDefault(entry => entry.Topic == topicId);
            var value = existing is not null && raise ? Math.Max(existing.Progress, next) : next;
            if (existing is not null)
            {
                existing.Progress = value;
            }
            else
            {
                topics.Add(new UserTopicEntry { Topic = topicId, Progress = value });
            }

            stored = value;
        }

        user.Topics = topics;
        user.UpdatedAt = DateTime.UtcNow;
        await database.Users.ReplaceOneAsync(entry => entry.Id == user.Id, user);
        return (user, stored);
    }

    async Task<List<ObjectId>> FindTopicIds(string name)
    {
        var topics = await ListCourseTopics();
        var target = Normalize(name);
        var bySubject = topics.Where(topic => Normalize(topic.Subject) == target).ToArray();
        var matches = bySubject.Length > 0 ? bySubject : topics.Where(topic => Normalize(topic.Name) == target).ToArray();
        var unique = new Dictionary<string, ObjectId>();
        foreach (var topic in matches)
        {
            unique[topic.Id.ToString()] = topic.Id;
        }

        return unique.Values.ToList();
    }

    async Task<List<CourseTopic>> ListCourseTopics()
    {
        var courses = await database.Courses.Find(FilterDefinition<CourseDocument>.Empty).ToListAsync();
        var topics = new List<CourseTopic>();
        foreach (var course in courses)
        {
            foreach (var subject in course.Subjects ?? [])
            {
                foreach (var topic in subject.Topics ?? [])
                {
                    if (topic.Id == ObjectId.Empty)
                    {
                        continue;
                    }

                    topics.Add(new CourseTopic(topic.Id, topic.Name, subject.Name));
                }
            }
        }

        return topics;
    }

    static CourseDto ToDto(CourseDocument course) =>
        new(
            course.Name,
            course.Category,
            (course.Subjects ?? []).Select(subject => new CourseSubjectDto(
                subject.Name,
                subject.Description ?? "",
                (subject.Topics ?? []).Select(topic => new CourseTopicDto(topic.Name)).ToArray())).ToArray(),
            FormatDate(course.CreatedAt),
            FormatDate(course.UpdatedAt));

    static string FormatDate(DateTime value)
    {
        if (value == default)
        {
            return "";
        }

        var utc = value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
        };
        return utc.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
    }

    static string Normalize(string value) => value.Trim().ToLowerInvariant();

    sealed record CourseTopic(ObjectId Id, string Name, string Subject);
}

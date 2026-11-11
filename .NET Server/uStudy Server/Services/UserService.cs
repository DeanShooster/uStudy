using MongoDB.Bson;
using MongoDB.Driver;
using uStudy_Server.Auth;
using uStudy_Server.Constants;
using uStudy_Server.Contracts;
using uStudy_Server.Data;
using uStudy_Server.Errors;
using uStudy_Server.Validation;

namespace uStudy_Server.Services;

public sealed class UserService(AppDatabase database, TokenService tokens, CourseService courses)
{
    public async Task<AuthResult> SignUp(SignUpInput input)
    {
        var existing = await database.Users.Find(user => user.Email == input.Email).FirstOrDefaultAsync();
        if (existing is not null)
        {
            throw new AppException(StatusCodes.Status409Conflict, ErrorMessages.EmailTaken);
        }

        var now = DateTime.UtcNow;
        var user = new UserDocument
        {
            Id = ObjectId.GenerateNewId(),
            Name = input.Name,
            Email = input.Email,
            Password = BCrypt.Net.BCrypt.HashPassword(input.Password, AppConstants.BcryptSaltRounds),
            CreatedAt = now,
            UpdatedAt = now,
        };

        try
        {
            await database.Users.InsertOneAsync(user);
        }
        catch (MongoWriteException exception) when (exception.WriteError.Code == 11000)
        {
            throw new AppException(StatusCodes.Status409Conflict, ErrorMessages.EmailTaken);
        }

        return new AuthResult(tokens.Create(user.Email), await ToPublicUser(user));
    }

    public async Task<AuthResult> SignIn(SignInInput input)
    {
        var user = await database.Users.Find(entry => entry.Email == input.Email).FirstOrDefaultAsync();
        var valid = false;
        if (user is not null && !string.IsNullOrEmpty(user.Password))
        {
            try
            {
                valid = BCrypt.Net.BCrypt.Verify(input.Password, user.Password);
            }
            catch (BCrypt.Net.SaltParseException)
            {
                valid = false;
            }
        }

        if (user is null || !valid)
        {
            throw new AppException(StatusCodes.Status401Unauthorized, ErrorMessages.InvalidCredentials);
        }

        return new AuthResult(tokens.Create(user.Email), await ToPublicUser(user));
    }

    public async Task<PublicUser> GetAuthenticatedUser(string email) =>
        await ToPublicUser(await database.RequireUser(email));

    public async Task<IReadOnlyList<PublicTopic>> ToPublicTopics(UserDocument user) =>
        (await ToPublicUser(user)).Topics;

    async Task<PublicUser> ToPublicUser(UserDocument user)
    {
        var topics = user.Topics ?? [];
        var names = topics.Count == 0
            ? new Dictionary<string, string>()
            : await courses.TopicNamesById();

        var visible = new List<PublicTopic>();
        foreach (var entry in topics)
        {
            if (!names.TryGetValue(entry.Topic.ToString(), out var name) || name.Length == 0)
            {
                continue;
            }

            visible.Add(new PublicTopic(new PublicTopicName(name), (int)Math.Round(entry.Progress)));
        }

        return new PublicUser(user.Name, user.Email, visible);
    }
}

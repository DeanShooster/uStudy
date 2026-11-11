using MongoDB.Bson;
using MongoDB.Driver;
using uStudy_Server.Configuration;
using uStudy_Server.Constants;
using uStudy_Server.Errors;

namespace uStudy_Server.Data;

public sealed class AppDatabase
{
    readonly IMongoDatabase _database;

    public AppDatabase(ServerConfig config)
    {
        var url = new MongoUrl(config.MongoUri);
        if (string.IsNullOrEmpty(url.DatabaseName))
        {
            throw new InvalidOperationException(ErrorMessages.MissingDatabase);
        }

        var client = new MongoClient(url);
        _database = client.GetDatabase(url.DatabaseName);
        Users = _database.GetCollection<UserDocument>("users");
        Courses = _database.GetCollection<CourseDocument>("courses");
        Sessions = _database.GetCollection<SessionDocument>("sessions");
    }

    public IMongoCollection<UserDocument> Users { get; }

    public IMongoCollection<CourseDocument> Courses { get; }

    public IMongoCollection<SessionDocument> Sessions { get; }

    public Task Ping(CancellationToken cancellationToken) =>
        _database.RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1), cancellationToken: cancellationToken);

    public async Task<UserDocument> RequireUser(string email)
    {
        var user = await Users.Find(entry => entry.Email == email).FirstOrDefaultAsync();
        if (user is null)
        {
            throw new AppException(StatusCodes.Status401Unauthorized, ErrorMessages.AuthRequired);
        }

        return user;
    }
}

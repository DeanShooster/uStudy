using System.Reflection;

namespace uStudy_Server.Auth;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RequireAuthAttribute : Attribute
{
    public static bool AppliesTo(MethodInfo method) =>
        method.DeclaringType?.IsDefined(typeof(RequireAuthAttribute), inherit: true) == true
        || method.IsDefined(typeof(RequireAuthAttribute), inherit: true);
}

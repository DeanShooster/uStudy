using MongoDB.Bson;
using MongoDB.Bson.IO;
using MongoDB.Bson.Serialization;

namespace uStudy_Server.Data;

public sealed class FlexibleDoubleSerializer : IBsonSerializer<double>
{
    public Type ValueType => typeof(double);

    public double Deserialize(BsonDeserializationContext context, BsonDeserializationArgs args)
    {
        var reader = context.Reader;
        switch (reader.GetCurrentBsonType())
        {
            case BsonType.Double:
                return reader.ReadDouble();
            case BsonType.Int32:
                return reader.ReadInt32();
            case BsonType.Int64:
                return reader.ReadInt64();
            case BsonType.Decimal128:
                return (double)Decimal128.ToDecimal(reader.ReadDecimal128());
            case BsonType.String when double.TryParse(reader.ReadString(), out var parsed):
                return parsed;
            case BsonType.Null:
                reader.ReadNull();
                return 0;
            default:
                reader.SkipValue();
                return 0;
        }
    }

    public void Serialize(BsonSerializationContext context, BsonSerializationArgs args, double value) =>
        context.Writer.WriteDouble(value);

    object IBsonSerializer.Deserialize(BsonDeserializationContext context, BsonDeserializationArgs args) =>
        Deserialize(context, args);

    void IBsonSerializer.Serialize(BsonSerializationContext context, BsonSerializationArgs args, object value) =>
        Serialize(context, args, (double)value);
}

public sealed class FlexibleObjectIdSerializer : IBsonSerializer<ObjectId>
{
    public Type ValueType => typeof(ObjectId);

    public ObjectId Deserialize(BsonDeserializationContext context, BsonDeserializationArgs args)
    {
        var reader = context.Reader;
        switch (reader.GetCurrentBsonType())
        {
            case BsonType.ObjectId:
                return reader.ReadObjectId();
            case BsonType.String when ObjectId.TryParse(reader.ReadString(), out var parsed):
                return parsed;
            case BsonType.Document:
                return ReadDocument(reader);
            case BsonType.Null:
                reader.ReadNull();
                return ObjectId.Empty;
            default:
                reader.SkipValue();
                return ObjectId.Empty;
        }
    }

    public void Serialize(BsonSerializationContext context, BsonSerializationArgs args, ObjectId value) =>
        context.Writer.WriteObjectId(value);

    object IBsonSerializer.Deserialize(BsonDeserializationContext context, BsonDeserializationArgs args) =>
        Deserialize(context, args);

    void IBsonSerializer.Serialize(BsonSerializationContext context, BsonSerializationArgs args, object value) =>
        Serialize(context, args, (ObjectId)value);

    static ObjectId ReadDocument(IBsonReader reader)
    {
        ObjectId id = ObjectId.Empty;
        reader.ReadStartDocument();
        while (reader.ReadBsonType() != BsonType.EndOfDocument)
        {
            var name = reader.ReadName(Utf8NameDecoder.Instance);
            if (name == "_id" && reader.GetCurrentBsonType() == BsonType.ObjectId)
            {
                id = reader.ReadObjectId();
            }
            else
            {
                reader.SkipValue();
            }
        }

        reader.ReadEndDocument();
        return id;
    }
}

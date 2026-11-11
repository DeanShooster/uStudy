import { Schema, type Model } from "mongoose";
import mainDB from "../../connection";
import { courseCategories, ISubject, ITopic, type ICourse } from "./interface";

type CourseModel = Model<ICourse>;

const TopicSchema = new Schema<ITopic>({
  name: { type: String, required: true, trim: true },
}, { timestamps: true });

const SubjectSchema = new Schema<ISubject>({
  name: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  topics: { type: [TopicSchema], default: undefined },
}, { timestamps: true });

const CourseSchema = new Schema<ICourse, CourseModel>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    category: { type: String, required: true, enum: courseCategories },
    subjects: { type: [SubjectSchema], default: undefined }
  },
  { timestamps: true },
);

export const Course = mainDB.model<ICourse, CourseModel>("Course", CourseSchema);

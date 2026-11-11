import { Types } from "mongoose";
import { ErrorMessage, HttpStatus } from "../../constants";
import { Course } from "../../database/models/course/course";
import type { ITopic } from "../../database/models/course/interface";
import { courseCategories, type CourseCategory, type ICourse } from "../../database/models/course/interface";
import { requireUser } from "../../database/models/user/user";
import { AppError } from "../../middlewares/ErrorHandler";

const COMPLETED_PROGRESS = 100;

interface CourseTopic {
  id: Types.ObjectId;
  name: string;
  subject: string;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function readTopics(topics: ITopic[] | undefined): { id: Types.ObjectId; name: string }[] {
  return (topics ?? []).flatMap((topic) => {
    const id = (topic as ITopic & { _id?: Types.ObjectId })._id;
    return id ? [{ id, name: topic.name }] : [];
  });
}

async function listCourseTopics(): Promise<CourseTopic[]> {
  const courses = await Course.find();
  const topics: CourseTopic[] = [];

  for (const course of courses) {
    for (const subject of course.subjects ?? []) {
      for (const topic of readTopics(subject.topics)) {
        topics.push({ ...topic, subject: subject.name });
      }
    }
  }

  return topics;
}

async function findTopicIds(name: string): Promise<Types.ObjectId[]> {
  const topics = await listCourseTopics();
  const target = normalizeName(name);
  const bySubject = topics.filter((topic) => normalizeName(topic.subject) === target);
  const matches = bySubject.length > 0 ? bySubject : topics.filter((topic) => normalizeName(topic.name) === target);
  return [...new Map(matches.map((topic) => [String(topic.id), topic.id])).values()];
}

async function saveTopicProgress(email: string, name: string, progress: number, raise: boolean) {
  const topicIds = await findTopicIds(name);
  if (topicIds.length === 0) return null;

  const next = Math.min(COMPLETED_PROGRESS, Math.max(0, Math.round(progress)));
  const user = await requireUser(email);
  const topics = [...(user.topics ?? [])];
  let stored = next;

  for (const topicId of topicIds) {
    const existing = topics.find((entry) => String(entry.topic) === String(topicId));
    const value = existing && raise ? Math.max(existing.progress ?? 0, next) : next;

    if (existing) {
      existing.progress = value;
    } else {
      topics.push({ topic: topicId, progress: value });
    }

    stored = value;
  }

  user.set("topics", topics);
  await user.save();
  return { user, stored };
}

export async function topicNamesById(): Promise<Map<string, string>> {
  const topics = await listCourseTopics();
  return new Map(topics.map((topic) => [String(topic.id), topic.name]));
}

export async function completeByName(email: string, name: string) {
  const result = await saveTopicProgress(email, name, COMPLETED_PROGRESS, false);

  if (!result) {
    throw new AppError(HttpStatus.notFound, ErrorMessage.subjectOrTopicNotFound);
  }

  return result.user;
}

export async function readTopicProgress(email: string, name: string) {
  const topicIds = await findTopicIds(name);
  if (topicIds.length === 0) return 0;

  let user;
  try {
    user = await requireUser(email);
  } catch (error) {
    if (error instanceof AppError && error.statusCode === HttpStatus.unauthorized) return 0;
    throw error;
  }

  const selected = new Set(topicIds.map((topicId) => String(topicId)));
  const values = (user.topics ?? [])
    .filter((entry) => selected.has(String(entry.topic)))
    .map((entry) => entry.progress ?? 0);

  return values.length > 0 ? Math.max(...values) : 0;
}

export async function setTopicProgress(email: string, name: string, progress: number) {
  const result = await saveTopicProgress(email, name, progress, true);
  return result ? result.stored : null;
}

export async function removeByName(email: string, name: string) {
  const topicIds = await findTopicIds(name);

  if (topicIds.length === 0) {
    throw new AppError(HttpStatus.notFound, ErrorMessage.subjectOrTopicNotFound);
  }

  const user = await requireUser(email);
  const selected = new Set(topicIds.map((topicId) => String(topicId)));
  user.set("topics", (user.topics ?? []).filter((entry) => !selected.has(String(entry.topic))));
  await user.save();
  return user;
}

export function getCategories(): CourseCategory[] {
  return [...courseCategories];
}

export async function getCoursesByCategory(category: CourseCategory): Promise<ICourse[]> {
  return Course.find({ category });
}

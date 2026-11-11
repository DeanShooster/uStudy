export const courseCategories = [
  "Math",
  "Language",
  "Chemistry",
  "Computer Science",
  "Physics",
  "Geography",
  "History",
  "Biology",
] as const;

export type CourseCategory = (typeof courseCategories)[number];

export interface ICourse {
  name: string;
  category: CourseCategory;
  subjects: ISubject[];
  createdAt: Date;
  updatedAt: Date;
}


export interface ISubject {
  name: string;
  description: string;
  topics: ITopic[];
}

export interface ITopic {
  name: string;
}
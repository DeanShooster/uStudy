import type { Request, Response } from "express";
import { HttpStatus } from "../../constants";
import type { CourseCategory } from "../../database/models/course/interface";
import { requireEmail } from "../../middlewares/authenticate";
import { routeParam } from "../../middlewares/validate";
import { toPublicTopics } from "../User/user.service";
import { completeByName, getCategories, getCoursesByCategory, removeByName } from "./course.service";

export function getCategoriesHandler(_req: Request, res: Response): void {
  res.status(HttpStatus.ok).json({ categories: getCategories() });
}

export async function getCoursesByCategoryHandler(req: Request, res: Response): Promise<void> {
  const courses = await getCoursesByCategory(routeParam(req, "category") as CourseCategory);
  res.status(HttpStatus.ok).json({ courses });
}

export async function completeTopicsHandler(req: Request, res: Response): Promise<void> {
  const user = await completeByName(requireEmail(req), routeParam(req, "name"));
  res.status(HttpStatus.ok).json({ topics: await toPublicTopics(user) });
}

export async function removeTopicsHandler(req: Request, res: Response): Promise<void> {
  const user = await removeByName(requireEmail(req), routeParam(req, "name"));
  res.status(HttpStatus.ok).json({ topics: await toPublicTopics(user) });
}

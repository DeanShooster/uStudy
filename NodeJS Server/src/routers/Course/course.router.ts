import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { validateParams } from "../../middlewares/validate";
import { routing } from "../routing";
import { completeTopicsHandler, getCategoriesHandler, getCoursesByCategoryHandler, removeTopicsHandler } from "./course.controller";
import { categoryParamSchema, progressNameSchema } from "./course.schema";

const courseRouter = Router();

courseRouter.get(routing.course.categories, getCategoriesHandler);
courseRouter.post(routing.course.complete, authenticate, validateParams(progressNameSchema), completeTopicsHandler);
courseRouter.delete(routing.course.remove, authenticate, validateParams(progressNameSchema), removeTopicsHandler);
courseRouter.get(routing.course.byCategory, validateParams(categoryParamSchema), getCoursesByCategoryHandler);

export default courseRouter;

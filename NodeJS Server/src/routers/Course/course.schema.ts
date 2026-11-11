import { z } from "zod";
import { ErrorMessage } from "../../constants";
import { courseCategories } from "../../database/models/course/interface";

export const categoryParamSchema = z.object({
  category: z.enum(courseCategories, ErrorMessage.invalidCategory),
});

export const progressNameSchema = z.object({
  name: z.string().trim().min(1, ErrorMessage.invalidRequest),
});

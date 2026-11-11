import "./config/loadEnv";

import express from "express";
import cors from "cors";

import { ErrorHandler } from "./middlewares/ErrorHandler";
import classroomRouter from "./routers/Classroom/classroom.router";
import courseRouter from "./routers/Course/course.router";
import { routing } from "./routers/routing";
import userRouter from "./routers/User/user.router";

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "3mb" }));

app.use(routing.user.base, userRouter);
app.use(routing.course.base, courseRouter);
app.use(routing.classroom.base, classroomRouter);
app.use(ErrorHandler);

app.listen(port, () => {
  console.log(`Server is online on Port: ${port}`);
});

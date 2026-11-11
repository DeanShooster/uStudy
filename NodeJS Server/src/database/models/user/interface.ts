import { Types } from "mongoose";

export interface IUserTopicProgress {
    topic: Types.ObjectId;
    progress: number;
}

export interface IUser{
    name: string;
    email: string;
    password: string;
    topics?: IUserTopicProgress[];
    createdAt: Date;
    updatedAt: Date;
}

export interface IUserMethods {
    comparePassword(candidate: string): Promise<boolean>;
}
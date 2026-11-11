import bcrypt from "bcryptjs";
import { Schema, type Model } from "mongoose";
import { BCRYPT_SALT_ROUNDS, ErrorMessage, HttpStatus, PASSWORD_MIN_LENGTH } from "../../../constants";
import { AppError } from "../../../middlewares/ErrorHandler";
import mainDB from "../../connection";

import { IUser, IUserMethods } from "./interface";

type UserModel = Model<IUser, Record<string, never>, IUserMethods>;

const UserSchema = new Schema<IUser, UserModel, IUserMethods>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: PASSWORD_MIN_LENGTH, select: false },
  topics: { type: [{ topic: { type: Schema.Types.ObjectId, ref: "Topic" }, progress: { type: Number, default: 0 } }], default: undefined },
}, { timestamps: true });


UserSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, BCRYPT_SALT_ROUNDS);
});

UserSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

export const User = mainDB.model<IUser, UserModel>("User", UserSchema);

export async function requireUser(email: string) {
  const user = await User.findOne({ email });

  if (!user) {
    throw new AppError(HttpStatus.unauthorized, ErrorMessage.authRequired);
  }

  return user;
}
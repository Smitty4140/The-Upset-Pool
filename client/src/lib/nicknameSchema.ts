import { z } from "zod";

export const NICKNAME_REGEX = /^[a-zA-Z0-9 _-]+$/;

export const nicknameSchema = z
  .string()
  .transform((val) => val.trim())
  .pipe(
    z
      .string()
      .min(3, "Nickname must be at least 3 characters")
      .max(25, "Nickname must be 25 characters or fewer")
      .regex(NICKNAME_REGEX, "Nickname may only contain letters, numbers, spaces, hyphens, and underscores"),
  );

import { z } from "zod";
export const projectSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give your project a title.")
    .max(160, "Use 160 characters or fewer."),
  citation_style: z.enum(["apa", "mla", "ieee"]).default("apa"),
  research_problem: z.string().trim().max(4000).default(""),
  structure: z.enum(["five-chapter", "blank"]).default("five-chapter"),
});
export const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(12, "Use at least 12 characters.").max(128),
});
export function safeNextPath(value: string | null): string {
  return value === "/auth/update-password" ? value : "/";
}

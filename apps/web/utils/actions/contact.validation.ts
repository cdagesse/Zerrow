import { z } from "zod";

const urlOrEmpty = z.string().url().max(2000).or(z.literal(""));

export const updateContactBody = z.object({
  email: z.string().email(),
  name: z.string().max(200).nullish(),
  title: z.string().max(200).nullish(),
  phone: z.string().max(100).nullish(),
  notes: z.string().max(10_000).nullish(),
  photoUrl: urlOrEmpty.nullish(),
  useCompanyLogo: z.boolean().optional(),
  isPersonal: z.boolean().optional(),
  // "" clears the company; a name finds-or-creates one and adopts the
  // contact's email domain
  companyName: z.string().max(200).nullish(),
});
export type UpdateContactBody = z.infer<typeof updateContactBody>;

export const enrichContactBody = z.object({
  email: z.string().email(),
});
export type EnrichContactBody = z.infer<typeof enrichContactBody>;

export const createCompanyBody = z.object({
  name: z.string().min(1).max(200),
  domains: z.array(z.string().min(1).max(200)).max(50).optional(),
});
export type CreateCompanyBody = z.infer<typeof createCompanyBody>;

export const updateCompanyBody = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  domains: z.array(z.string().min(1).max(200)).max(50).optional(),
  logoUrl: urlOrEmpty.nullish(),
  // "" clears the label; a name finds-or-creates one, optionally nested
  // under a parent label ("Factory" > Toyota)
  labelName: z.string().max(100).nullish(),
  labelParentName: z.string().max(100).nullish(),
});
export type UpdateCompanyBody = z.infer<typeof updateCompanyBody>;

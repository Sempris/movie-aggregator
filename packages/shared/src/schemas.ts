import { z } from 'zod';
import { WEIGHT_MAX, WEIGHT_MIN } from './preferences';
import { SOURCE_IDS } from './sources';

export const sourceIdSchema = z.enum(SOURCE_IDS);
export const weightSchema = z.number().min(WEIGHT_MIN).max(WEIGHT_MAX);

export const searchMoviesInput = z.object({
  query: z.string().trim().min(1).max(200),
  page: z.number().int().min(1).max(50).default(1),
});

export const movieByTmdbIdInput = z.object({
  tmdbId: z.number().int().positive(),
});

export const updatePreferenceInput = z
  .object({
    sourceId: sourceIdSchema,
    enabled: z.boolean().optional(),
    weight: weightSchema.optional(),
  })
  .refine((value) => value.enabled !== undefined || value.weight !== undefined, {
    message: 'Provide enabled, weight, or both',
  });

export const setAllPreferencesInput = z.object({
  preferences: z
    .array(
      z.object({
        sourceId: sourceIdSchema,
        enabled: z.boolean(),
        weight: weightSchema,
      }),
    )
    .max(SOURCE_IDS.length),
});

export const emailSchema = z
  .email({ message: 'Enter a valid email address' })
  .max(254)
  .transform((value) => value.trim().toLowerCase());

export const passwordSchema = z
  .string()
  .min(10, { message: 'Use at least 10 characters' })
  .max(128, { message: 'Use at most 128 characters' });

export const registerInput = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(60).optional(),
});

export const loginInput = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export type SearchMoviesInput = z.infer<typeof searchMoviesInput>;
export type MovieByTmdbIdInput = z.infer<typeof movieByTmdbIdInput>;
export type UpdatePreferenceInput = z.infer<typeof updatePreferenceInput>;
export type SetAllPreferencesInput = z.infer<typeof setAllPreferencesInput>;
export type RegisterInput = z.infer<typeof registerInput>;
export type LoginInput = z.infer<typeof loginInput>;

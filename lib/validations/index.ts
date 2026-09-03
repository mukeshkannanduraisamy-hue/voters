import { z } from 'zod'

export const loginSchema = z.object({
  mobile_number: z.string().regex(/^[6-9]\d{9}$/, 'Invalid mobile number'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const surveySchema = z.object({
  epic_id: z.string().min(1),
  phone_number: z.string().regex(/^[6-9]\d{9}$/, 'Invalid mobile number'),
  caste_id: z.number().int().positive(),
  job_id: z.number().int().positive(),
  other_job_text: z.string().optional(),
  party_id: z.number().int().positive(),
  corrected_name_ta: z.string().optional(),
  corrected_relative_name_ta: z.string().optional(),
})

export const createUserSchema = z.object({
  mobile_number: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['A2_SUPERVISOR', 'A3_FIELD_AGENT']),
  epic_id: z.string().optional().default(''),
  part_ids: z.array(z.coerce.number().int().positive()).min(1, 'Please select at least one Polling Booth / Part'),
  is_active: z.boolean().default(true),
})

export const masterItemSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  // party specific
  party_code: z.string().optional(),
  color_code: z.string().optional(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type SurveyInput = z.infer<typeof surveySchema>
export type CreateUserInput = z.infer<typeof createUserSchema>

import { z } from 'zod';

export const createInvitationSchema = z.object({
  candidate_id:  z.string().uuid(),
  vacancy_title: z.string().trim().max(200).optional(),
  offer:         z.string().trim().min(1).max(2000),
  salary_from:   z.number().int().min(0).max(10_000_000),
  salary_to:     z.number().int().min(0).max(10_000_000),
  channel:       z.enum(['telegram','email','phone']).optional(),
}).refine(d => d.salary_to >= d.salary_from, {
  message: '«до» должно быть ≥ «от»',
  path: ['salary_to'],
});

export const statusSchema = z.object({
  status: z.enum(['viewed','accepted','rejected']),
});
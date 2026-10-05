import { z } from 'zod';

export const registerSchema = z.object({
  email:    z.string().trim().toLowerCase().email('Некорректный email'),
  password: z.string().min(8, 'Пароль должен быть не менее 8 символов').max(128),
  role:     z.enum(['candidate', 'employer'], { errorMap: () => ({ message: 'role: candidate или employer' }) }),
  consent:  z.literal(true, { errorMap: () => ({ message: 'Требуется согласие на обработку ПД (152-ФЗ)' }) }),
});

export const loginSchema = z.object({
  email:    z.string().trim().toLowerCase().email('Некорректный email'),
  password: z.string().min(1, 'Пароль обязателен'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
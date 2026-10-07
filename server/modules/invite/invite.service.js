import * as repo from './invite.repo.js';

const wrap = (code, message) => {
  const e = new Error(code);
  e.code = code;
  if (message) e.message = message;
  return e;
};

export const create = async ({ employerId, data }) => {
  // Prototype: приглашение можно отправить любому кандидату.
  // В проде проверить: candidate существует, role='candidate', нет дубля за 24ч.
  return repo.insertInvitation({ employerId, ...data });
};

export const listMine = async ({ userId, role }) => {
  if (role === 'employer') return repo.listByEmployer(userId);
  if (role === 'candidate') return repo.listByCandidate(userId);
  return [];
};

export const getOne = async ({ id, userId, role }) => {
  const inv = await repo.getInvitation(id);
  if (!inv) throw wrap('NOT_FOUND');
  if (role === 'employer'  && inv.employer_id  !== userId) throw wrap('FORBIDDEN');
  if (role === 'candidate' && inv.candidate_id !== userId) throw wrap('FORBIDDEN');

  // Если кандидат открывает «sent» — помечаем «viewed»
  if (role === 'candidate' && inv.status === 'sent') {
    await repo.markViewed(id);
    inv.status = 'viewed';
  }
  return inv;
};

export const setStatus = async ({ id, userId, role, status }) => {
  const inv = await repo.getInvitation(id);
  if (!inv) throw wrap('NOT_FOUND');
  if (role === 'candidate' && inv.candidate_id !== userId) throw wrap('FORBIDDEN');
  if (role === 'employer'  && inv.employer_id  !== userId) throw wrap('FORBIDDEN');

  // Кандидат: только accepted/rejected. Работодатель: только viewed.
  if (role === 'candidate' && !['accepted','rejected'].includes(status)) throw wrap('FORBIDDEN');
  if (role === 'employer'  && status !== 'viewed')                       throw wrap('FORBIDDEN');
  if (['accepted','rejected'].includes(inv.status)) throw wrap('ALREADY_CLOSED');

  return repo.updateStatus(id, status);
};
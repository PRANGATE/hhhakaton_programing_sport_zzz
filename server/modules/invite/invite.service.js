import * as repo from './invite.repo.js';

const wrap = (code, message) => {
  const e = new Error(code);
  e.code = code;
  if (message) e.message = message;
  return e;
};

export const create = async ({ employerId, data }) => {
  return repo.insertInvitation({
    employerId,
    candidateId:  data.candidate_id,
    vacancyTitle: data.vacancy_title,
    offer:        data.offer,
    salaryFrom:   data.salary_from,
    salaryTo:     data.salary_to,
    channel:      data.channel,
  });
};

export const listMine = async ({ userId, role }) => {
  if (role === 'employer') return repo.listByEmployer(userId);
  if (role === 'candidate') return repo.listByCandidate(userId);
  return [];
};

export const getOne = async ({ id, userId, role }) => {
  // Для проверки прав нужен внутренний геттер — там точно есть
  // и employer_id, и candidate_id.
  const inv = await repo.getInvitationInternal(id);
  if (!inv) throw wrap('NOT_FOUND');
  if (role === 'employer'  && inv.employer_id  !== userId) throw wrap('FORBIDDEN');
  if (role === 'candidate' && inv.candidate_id !== userId) throw wrap('FORBIDDEN');

  if (role === 'candidate' && inv.status === 'sent') {
    await repo.markViewed(id);
    inv.status = 'viewed';
  }

  // Наружу отдаём через публичный геттер — он маскирует email кандидата
  // до accepted. Для кандидата это не важно (это его email), но единый
  // ответ проще держать консистентным.
  return repo.getInvitation(id);
};

export const setStatus = async ({ id, userId, role, status }) => {
  const inv = await repo.getInvitationInternal(id);
  if (!inv) throw wrap('NOT_FOUND');
  if (role === 'candidate' && inv.candidate_id !== userId) throw wrap('FORBIDDEN');
  if (role === 'employer'  && inv.employer_id  !== userId) throw wrap('FORBIDDEN');

  if (role === 'candidate' && !['accepted','rejected'].includes(status)) throw wrap('FORBIDDEN');
  if (role === 'employer'  && status !== 'viewed')                       throw wrap('FORBIDDEN');
  if (['accepted','rejected'].includes(inv.status)) throw wrap('ALREADY_CLOSED');

  await repo.updateStatus(id, status);
  return repo.getInvitation(id);
};
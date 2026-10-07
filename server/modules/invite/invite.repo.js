import { query } from '../../db.js';

export const insertInvitation = async (data) => {
  const { rows } = await query(
    `INSERT INTO invite.invitations
       (employer_id, candidate_id, vacancy_title, offer,
        salary_from, salary_to, channel)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      data.employerId, data.candidateId,
      data.vacancyTitle || null, data.offer,
      data.salaryFrom, data.salaryTo,
      data.channel || 'telegram',
    ]
  );
  return rows[0];
};

export const getInvitation = async (id) => {
  const { rows } = await query(
    `SELECT i.*, 
            eu.email AS employer_email,
            cu.email AS candidate_email
       FROM invite.invitations i
       JOIN auth.users eu ON eu.id = i.employer_id
       JOIN auth.users cu ON cu.id = i.candidate_id
      WHERE i.id = $1`,
    [id]
  );
  return rows[0] || null;
};

export const listByEmployer = async (employerId) => {
  const { rows } = await query(
    `SELECT i.*, cu.email AS candidate_email
       FROM invite.invitations i
       JOIN auth.users cu ON cu.id = i.candidate_id
      WHERE i.employer_id = $1
      ORDER BY i.created_at DESC`,
    [employerId]
  );
  return rows;
};

export const listByCandidate = async (candidateId) => {
  const { rows } = await query(
    `SELECT i.*, eu.email AS employer_email,
            ep.company_name AS employer_company,
            ep.contact_person, ep.contact_telegram, ep.contact_phone, ep.contact_email
       FROM invite.invitations i
       JOIN auth.users eu ON eu.id = i.employer_id
       LEFT JOIN profile.employers ep ON ep.user_id = i.employer_id
      WHERE i.candidate_id = $1
      ORDER BY i.created_at DESC`,
    [candidateId]
  );
  return rows;
};

export const updateStatus = async (id, status) => {
  const { rows } = await query(
    `UPDATE invite.invitations
        SET status = $2, updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id, status]
  );
  return rows[0] || null;
};

// Только пометить «просмотрено», если сейчас «sent».
export const markViewed = async (id) => {
  await query(
    `UPDATE invite.invitations
        SET status = 'viewed', updated_at = now()
      WHERE id = $1 AND status = 'sent'`,
    [id]
  );
};
export type UserRole = 'lawyer' | 'law_student' | 'general_user';

export const ROLE_LABELS: Record<UserRole, string> = {
  lawyer: 'Lawyer',
  law_student: 'Law Student',
  general_user: 'General User',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  lawyer: 'Practising lawyers — client management, case research, document drafting, and compliance.',
  law_student: 'Law students — moot prep, case summaries, statute guides, and mentorship.',
  general_user: 'Individuals, businesses, journalists, and others seeking legal guidance.',
};

export const ALL_ROLES: UserRole[] = ['lawyer', 'law_student', 'general_user'];

export function isLegalPro(role?: UserRole | null) {
  return role === 'lawyer' || role === 'law_student';
}
export function isLawyer(role?: UserRole | null) {
  return role === 'lawyer';
}
export function isLawStudent(role?: UserRole | null) {
  return role === 'law_student';
}

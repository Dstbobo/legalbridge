export type UserRole = 'legal_professional' | 'general_user';

export const ROLE_LABELS: Record<UserRole, string> = {
  legal_professional: 'Legal Professional',
  general_user: 'General User',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  legal_professional: 'Lawyers and law students — advanced legal tools, case research, and moot prep.',
  general_user: 'Individuals, businesses, journalists, and others seeking legal guidance.',
};

export const ALL_ROLES: UserRole[] = ['legal_professional', 'general_user'];

export function isLegalPro(role?: UserRole | null) {
  return role === 'legal_professional';
}

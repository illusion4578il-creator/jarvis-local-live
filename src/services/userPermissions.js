import { createPermissions } from '@/services/permissions';

export const PROFILES = {
  Admin_c: {
    label: 'Admin',
    isDefault: false,
    isPublic: false,
    canManageTeam: true,
    reportsTo: null,
  },
  Developer_c: {
    label: 'AI Engineer',
    isDefault: true,
    isPublic: false,
    canManageTeam: false,
    reportsTo: 'Admin_c',
  },
};

const TABLE_PERMISSIONS = {
  Admin_c: {
    skills_c: { access: 'Full' },
    documents_c: { access: 'Full' },
    executions_c: { access: 'Full' },
    memories_c: { access: 'Full' },
  },
  Developer_c: {
    skills_c: { access: 'Full' },
    documents_c: { access: 'Full' },
    executions_c: { access: 'Read,Create,Update' },
    memories_c: { access: 'Read,Create,Update' },
  },
};

export const { getProfileMeta, getTableAccess, getFieldAccess } = createPermissions(
  PROFILES,
  TABLE_PERMISSIONS
);

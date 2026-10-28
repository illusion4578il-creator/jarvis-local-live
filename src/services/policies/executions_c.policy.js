const isAdmin = (u) => u.profile === 'Admin_c';
const isDeveloper = (u) => u.profile === 'Developer_c';

export const select = (record, user) => {
  if (!user) return false;
  return isAdmin(user) || isDeveloper(user);
};

export const insert = (record, user) => {
  if (!user) return false;
  return isAdmin(user) || isDeveloper(user);
};

export const update = (record, user) => {
  if (!user) return false;
  return isAdmin(user) || isDeveloper(user);
};

export const remove = (record, user) => {
  if (!user) return false;
  return isAdmin(user);
};

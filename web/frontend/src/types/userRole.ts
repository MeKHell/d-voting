interface User {
  sciper: string;
  role: UserRole;
}

export const enum UserRole {
  Admin = 'admin',
  Operator = 'operator',
}

export type { User };

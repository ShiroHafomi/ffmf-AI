import bcrypt from 'bcryptjs';

// bcryptjs is compatible with the existing $2y$10$ hashes used by the
// PHP password_hash() in the legacy data, so existing accounts can log in.
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

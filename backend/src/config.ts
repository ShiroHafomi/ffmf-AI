import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'ffms',
  },
  jwtSecret: process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me',
  jwtExpiresMin: Number(process.env.JWT_EXPIRES_MIN ?? 15),
  refreshExpiresDays: Number(process.env.REFRESH_EXPIRES_DAYS ?? 7),
  aiServiceUrl: process.env.AI_SERVICE_URL ?? 'http://localhost:8000',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
};

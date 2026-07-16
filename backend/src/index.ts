import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import authRouter from './routes/auth';
import predictRouter from './routes/predict';
import { errorHandler } from './middleware/error';

const app = express();

app.use(
  cors({
    origin: config.frontendOrigin,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRouter);
app.use('/api/predict', predictRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`FFMS backend listening on http://localhost:${config.port}`);
});

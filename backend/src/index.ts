import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { securityHeaders } from './middleware/security';
import authRouter from './routes/auth';
import predictRouter from './routes/predict';
import insightsRouter from './routes/insights';
import householdsRouter from './routes/households';
import categoriesRouter from './routes/categories';
import expensesRouter from './routes/expenses';
import budgetsRouter from './routes/budgets';
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
app.use(securityHeaders);
app.disable('x-powered-by');

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRouter);
app.use('/api/predict', predictRouter);
app.use('/api/insights', insightsRouter);
app.use('/api/households', householdsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/budgets', budgetsRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`FFMS backend listening on http://localhost:${config.port}`);
});

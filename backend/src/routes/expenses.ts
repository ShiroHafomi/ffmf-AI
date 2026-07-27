import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { requireCapability } from '../authz/authorize';
import { findUserById } from '../services/userService';
import { categoryExists } from '../services/categoryService';
import {
  listExpenses,
  createExpense,
  getExpense,
  updateExpense,
} from '../services/expenseService';
import { pool } from '../db';

const router = Router();

// ──────────────────────── Multer config ────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter(_req, file, cb) {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
    ];
    // Windows / browser may not send a MIME for .csv, so also accept by extension
    const ext = (file.originalname ?? '').split('.').pop()?.toLowerCase();
    if (allowed.includes(file.mimetype) || ext === 'csv' || ext === 'xls' || ext === 'xlsx') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed'));
    }
  },
});

// ── Column-name mapping (English / Vietnamese / case-insensitive) ──
const COLUMN_ALIASES: Record<string, string> = {
  // English
  date: 'date',
  expense_date: 'date',
  'expense date': 'date',
  amount: 'amount',
  total: 'amount',
  cost: 'amount',
  price: 'amount',
  sum: 'amount',
  value: 'amount',
  category: 'category',
  category_name: 'category',
  'category name': 'category',
  cat: 'category',
  description: 'description',
  desc: 'description',
  note: 'description',
  notes: 'description',
  detail: 'description',
  details: 'description',
  memo: 'description',
  // Vietnamese
  'ngày': 'date',
  'ngay': 'date',
  'số tiền': 'amount',
  'so tien': 'amount',
  'tiền': 'amount',
  'tien': 'amount',
  'thành tiền': 'amount',
  'thanh tien': 'amount',
  'danh mục': 'category',
  'danh muc': 'category',
  'phân loại': 'category',
  'phan loai': 'category',
  'loại': 'category',
  'loai': 'category',
  'mô tả': 'description',
  'mo ta': 'description',
  'diễn giải': 'description',
  'dien giai': 'description',
  'ghi chú': 'description',
  'ghi chu': 'description',
};

function normaliseHeader(h: string): string {
  const key = (h ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return COLUMN_ALIASES[key] ?? key;
}

// Parse a date from Excel serial number or string
function parseDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  // Excel serial date (number)
  if (typeof raw === 'number') {
    // Excel serial date epoch is 1900-01-01 (with the leap-year bug)
    const excelEpoch = new Date(1899, 11, 30); // Dec 30 1899
    const d = new Date(excelEpoch.getTime() + raw * 86400000);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  // Try YYYY-MM-DD or DD/MM/YYYY or MM/DD/YYYY
  const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m1) {
    const [_, y, mo, d] = m1;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) {
    // Try DD/MM/YYYY first (VN/UK), then MM/DD/YYYY (US)
    const [_, a, b, y] = m2;
    const ai = parseInt(a), bi = parseInt(b);
    if (ai > 12 && bi <= 12) {
      // a > 12 must be day
      return `${y}-${bi.toString().padStart(2, '0')}-${ai.toString().padStart(2, '0')}`;
    }
    if (bi > 12 && ai <= 12) {
      // b > 12 must be day
      return `${y}-${ai.toString().padStart(2, '0')}-${bi.toString().padStart(2, '0')}`;
    }
    if (ai <= 12 && bi <= 12) {
      // Ambiguous: prefer DD/MM/YYYY (VN locale)
      return `${y}-${bi.toString().padStart(2, '0')}-${ai.toString().padStart(2, '0')}`;
    }
    // Both > 12 can't be a valid date
    return null;
  }
  // Try JS Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

router.get('/', requireCapability('expense.view'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const expenses = await listExpenses(user.household_id, limit);
    return res.json({ expenses });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/', requireCapability('expense.create'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const { amount, description, category_id, expense_date } = req.body ?? {};
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    let categoryId: number | null = null;
    if (category_id != null) {
      const n = Number(category_id);
      if (Number.isFinite(n) && n > 0) categoryId = n;
    }

    // Prevent referencing a category from another household (authz check).
    if (categoryId != null) {
      const ok = await categoryExists(user.household_id, categoryId);
      if (!ok) {
        return res
          .status(400)
          .json({ error: 'category does not belong to your household' });
      }
    }

    let expenseDate: string | undefined;
    if (typeof expense_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expense_date)) {
      expenseDate = expense_date;
    }

    const id = await createExpense({
      householdId: user.household_id,
      userId: user.id,
      amount: amt,
      description: description ?? null,
      categoryId,
      expenseDate,
    });
    return res.status(201).json({ id });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// CSV export of the household's expenses (read-only, respects capability).
router.get('/export', requireCapability('expense.view'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const expenses = await listExpenses(user.household_id, 1000);
    const header = 'id,date,category,description,amount\n';
    const rows = expenses
      .map((e) =>
        [
          e.id,
          e.expense_date,
          (e.category_name ?? '').replace(/[,\n]/g, ' '),
          (e.description ?? '').replace(/[,\n]/g, ' '),
          e.amount,
        ].join(','),
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');
    return res.status(200).send(header + rows + '\n');
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ──────────────────────── Excel import ────────────────────────
router.post(
  '/import',
  requireCapability('expense.create'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      // Multer error captured via express error handler, but guard here too
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Please select an Excel or CSV file.' });
      }

      const user = await findUserById(req.userId!);
      if (!user || !user.household_id) {
        return res.status(400).json({ error: 'You need a household first' });
      }

      // Parse the file — support .xlsx, .xls (via xlsx) and .csv
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false, raw: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return res.status(400).json({ error: 'The file contains no sheets.' });
      }
      const sheet = workbook.Sheets[sheetName];

      // Convert to array-of-arrays
      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });

      if (rows.length < 2) {
        return res.status(400).json({ error: 'The file must have a header row and at least one data row.' });
      }

      // Normalise headers
      const rawHeaders = (rows[0] as unknown[]).map((h) => normaliseHeader(String(h ?? '')));
      const colIdx: Record<string, number> = {};
      rawHeaders.forEach((h, i) => {
        if (colIdx[h] === undefined) colIdx[h] = i;
      });

      // Find required columns
      const dateIdx = colIdx['date'];
      const amountIdx = colIdx['amount'];
      if (dateIdx === undefined) {
        return res.status(400).json({
          error: `Could not find a date column. Expected one of: Date, expense_date, Ngày. Found columns: ${rawHeaders.join(', ')}`,
        });
      }
      if (amountIdx === undefined) {
        return res.status(400).json({
          error: `Could not find an amount column. Expected one of: Amount, Total, Cost, Số tiền, Tiền. Found columns: ${rawHeaders.join(', ')}`,
        });
      }

      const catIdx = colIdx['category'] ?? undefined;
      const descIdx = colIdx['description'] ?? undefined;

      // Preload household categories for name → id mapping
      const [catRows] = await pool.execute<any[]>(
        'SELECT id, name FROM categories WHERE household_id = ?',
        [user.household_id],
      );
      const catNameToId: Record<string, number> = {};
      for (const c of catRows) {
        catNameToId[(c.name ?? '').toLowerCase().trim()] = c.id;
      }

      // Process each data row
      const imported: number[] = [];
      const skipped: { row: number; reason: string }[] = [];

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const rawDate = row[dateIdx];
        const rawAmount = row[amountIdx];
        const rawCat = catIdx !== undefined ? String(row[catIdx] ?? '').trim() : '';
        const rawDesc = descIdx !== undefined ? String(row[descIdx] ?? '').trim() : '';

        // Parse date
        const parsedDate = parseDate(rawDate);
        if (!parsedDate) {
          skipped.push({ row: r + 1, reason: `invalid or missing date "${String(rawDate).slice(0, 30)}"` });
          continue;
        }

        // Parse amount
        let amount = NaN;
        if (typeof rawAmount === 'number') {
          amount = rawAmount;
        } else {
          // Strip currency symbols, thousand separators
          const cleaned = String(rawAmount)
            .replace(/[$€£₫VNDđ]/gi, '')
            .replace(/\./g, '')
            .replace(/,/g, '.')
            .trim();
          amount = Number(cleaned);
        }
        if (!Number.isFinite(amount) || amount <= 0) {
          skipped.push({ row: r + 1, reason: `invalid amount "${String(rawAmount).slice(0, 30)}"` });
          continue;
        }

        // Look up category by name (case-insensitive starts-with) if the column exists
        let categoryId: number | null = null;
        if (rawCat) {
          const key = rawCat.toLowerCase().trim();
          // Exact match first
          if (catNameToId[key] !== undefined) {
            categoryId = catNameToId[key];
          } else {
            // Fuzzy: case-insensitive key lookup
            for (const [name, id] of Object.entries(catNameToId)) {
              if (name.toLowerCase().trim() === key) {
                categoryId = id;
                break;
              }
            }
          }
          // categoryId stays null if unmatched — endpoints silently accept it
        }

        // If category_id is provided via query param, use it as override
        const overrideCat = req.query.category_id ? Number(req.query.category_id) : null;
        if (overrideCat && Number.isFinite(overrideCat) && overrideCat > 0) {
          categoryId = overrideCat;
        }

        try {
          const newId = await createExpense({
            householdId: user.household_id!,
            userId: user.id,
            amount,
            description: rawDesc || null,
            categoryId,
            expenseDate: parsedDate,
          });
          imported.push(newId);
        } catch (e: any) {
          skipped.push({ row: r + 1, reason: e.message ?? 'unknown error' });
        }
      }

      return res.status(200).json({
        imported: imported.length,
        skipped: skipped.length,
        imported_ids: imported,
        details: skipped.length > 0 ? skipped : undefined,
        message:
          imported.length > 0
            ? `Successfully imported ${imported.length} expense${imported.length > 1 ? 's' : ''}.${skipped.length > 0 ? ` ${skipped.length} row${skipped.length > 1 ? 's' : ''} skipped.` : ''}`
            : `No rows could be imported. ${skipped.length} issue${skipped.length > 1 ? 's' : ''} found.`,
      });
    } catch (e: any) {
      if (e.message?.toLowerCase?.().includes('only excel')) {
        return res.status(400).json({ error: e.message });
      }
      return res.status(500).json({ error: e.message ?? 'Import failed' });
    }
  },
);

// ──────────────────────── Excel export ────────────────────────
router.get(
  '/export/excel',
  requireCapability('expense.view'),
  async (req: Request, res: Response) => {
    try {
      const user = await findUserById(req.userId!);
      if (!user || !user.household_id) {
        return res.status(400).json({ error: 'You need a household first' });
      }
      const expenses = await listExpenses(user.household_id, 10000);

      // Build workbook
      const data = expenses.map((e) => ({
        Date: e.expense_date ? String(e.expense_date).slice(0, 10) : '',
        Category: e.category_name ?? '',
        Description: e.description ?? '',
        Amount: Number(e.amount),
      }));

      const ws = XLSX.utils.json_to_sheet(data, { header: ['Date', 'Category', 'Description', 'Amount'] });

      // Auto-fit column widths
      const colWidths = [
        { wch: 12 }, // Date
        { wch: 20 }, // Category
        { wch: 40 }, // Description
        { wch: 14 }, // Amount
      ];
      ws['!cols'] = colWidths;

      // Enable auto-filter
      ws['!autofilter'] = { ref: ws['!ref'] ?? 'A1:D1' };

      // Format amount column as number with 2 decimals
      const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
      for (let r = range.s.r + 1; r <= range.e.r; r++) {
        const cellAddr = XLSX.utils.encode_cell({ c: 3, r }); // column D = index 3
        if (ws[cellAddr] && typeof ws[cellAddr].v === 'number') {
          ws[cellAddr].z = '#,##0.00';
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Expenses');

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="expenses.xlsx"');
      return res.status(200).send(buf);
    } catch (e: any) {
      return res.status(500).json({ error: e.message ?? 'Excel export failed' });
    }
  },
);

// ── Multer error handler: catch multer-specific errors (size, type) ──
router.use((err: any, _req: Request, res: Response, _next: any) => {
  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.message?.includes('Only Excel'))) {
    return res.status(400).json({ error: err.message ?? 'File too large. Maximum is 5 MB.' });
  }
  return res.status(500).json({ error: 'An unexpected error occurred.' });
});

function parseIdParam(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function statusFor(err: any): number {
  return /not found/i.test(err?.message ?? '') ? 404 : 500;
}

router.get('/:id', requireCapability('expense.view'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const id = parseIdParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'invalid id' });
    }
    const expense = await getExpense(id, user.household_id);
    if (!expense) {
      return res.status(404).json({ error: 'expense not found' });
    }
    return res.json({ expense });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.put('/:id', requireCapability('expense.create'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const id = parseIdParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'invalid id' });
    }

    const { amount, description, category_id, category, expense_date, date } =
      req.body ?? {};
    const patch: {
      amount?: number;
      categoryId?: number | null;
      expenseDate?: string;
      description?: string | null;
    } = {};

    if (amount !== undefined) {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' });
      }
      patch.amount = amt;
    }
    if (description !== undefined) {
      patch.description = description ?? null;
    }

    // Accept either category_id or the spec's `category` alias.
    const rawCat = category_id ?? category;
    if (rawCat !== undefined) {
      if (rawCat === null || rawCat === '') {
        patch.categoryId = null;
      } else {
        const n = Number(rawCat);
        if (!Number.isFinite(n) || n <= 0) {
          return res.status(400).json({ error: 'category_id must be a positive number' });
        }
        const ok = await categoryExists(user.household_id, n);
        if (!ok) {
          return res
            .status(400)
            .json({ error: 'category does not belong to your household' });
        }
        patch.categoryId = n;
      }
    }

    // Accept either expense_date or the spec's `date` alias.
    const rawDate = expense_date ?? date;
    if (rawDate !== undefined) {
      if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        patch.expenseDate = rawDate;
      } else {
        return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      }
    }

    await updateExpense(id, user.household_id, patch);
    return res.json({ id });
  } catch (e: any) {
    return res.status(statusFor(e)).json({ error: e.message });
  }
});

export default router;

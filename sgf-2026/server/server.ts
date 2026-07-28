import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import webDrivers from '../web/api/drivers/index.js';
import webDriversPreRegister from '../web/api/drivers/pre-register.js';
import webDriverProvisionAccess from '../web/api/drivers/[id]/provision-access.js';
import webDriverResetPassword from '../web/api/drivers/[id]/reset-password.js';
import webManagers from '../web/api/managers/index.js';
import webPartners from '../web/api/partners/index.js';

import adminIopgpsDevice from '../admin/api/iopgps-device.js';
import adminIopgps from '../admin/api/iopgps.js';
import adminManagers from '../admin/api/managers.js';
import adminTenantCreate from '../admin/api/tenants/create.js';

type LegacyHandler = (req: any, res: any) => unknown | Promise<unknown>;

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDist = path.join(rootDir, 'web', 'dist');
const adminDist = path.join(rootDir, 'admin', 'dist');

const PRODUCT_DOMAIN = (process.env.PRODUCT_DOMAIN || 'exattusrotta.com.br').toLowerCase();
const SUPERADMIN_HOST = `superadmin.${PRODUCT_DOMAIN}`;
const POSTO_HOST = `posto.${PRODUCT_DOMAIN}`;
const OFICINA_HOST = `oficina.${PRODUCT_DOMAIN}`;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

function cleanHostname(req: Request): string {
  return (req.hostname || req.headers.host || '')
    .split(':')[0]
    .trim()
    .toLowerCase();
}

function isSuperadminRequest(req: Request): boolean {
  const forcedSurface = process.env.APP_SURFACE?.toLowerCase();
  if (forcedSurface === 'admin') return true;
  if (forcedSurface === 'web') return false;
  return cleanHostname(req) === SUPERADMIN_HOST;
}

function invoke(handler: LegacyHandler, params: Record<string, string> = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const legacyReq = Object.create(req) as Request & { query: Record<string, unknown> };
    Object.defineProperty(legacyReq, 'query', {
      configurable: true,
      enumerable: true,
      value: { ...req.query, ...params, ...req.params },
    });

    try {
      await handler(legacyReq, res);
    } catch (error) {
      next(error);
    }
  };
}

function adminOnly(handler: LegacyHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isSuperadminRequest(req)) {
      res.status(404).json({ message: 'Endpoint não encontrado.' });
      return;
    }
    void invoke(handler)(req, res, next);
  };
}

function webOnly(handler: LegacyHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isSuperadminRequest(req)) {
      res.status(404).json({ message: 'Endpoint não encontrado.' });
      return;
    }
    void invoke(handler)(req, res, next);
  };
}

// APIs do painel de gestão, posto e oficina.
app.all('/api/drivers', webOnly(webDrivers));
app.all('/api/drivers/pre-register', webOnly(webDriversPreRegister));
app.all('/api/drivers/:id/provision-access', webOnly(webDriverProvisionAccess));
app.all('/api/drivers/:id/reset-password', webOnly(webDriverResetPassword));
app.all('/api/managers', (req, res, next) => {
  const handler = isSuperadminRequest(req) ? adminManagers : webManagers;
  void invoke(handler)(req, res, next);
});
app.all('/api/partners', webOnly(webPartners));

// APIs exclusivas do painel do superadministrador.
app.all('/api/tenants/create', adminOnly(adminTenantCreate));
app.all('/api/iopgps-device', adminOnly(adminIopgpsDevice));
app.all('/api/iopgps', adminOnly(adminIopgps));

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'Exattus Rotta',
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res, next) => {
  const host = cleanHostname(req);

  if (host === `www.${PRODUCT_DOMAIN}`) {
    res.redirect(308, `https://${PRODUCT_DOMAIN}${req.originalUrl}`);
    return;
  }

  if (host === POSTO_HOST && (req.path === '/' || req.path === '/login')) {
    res.redirect(302, '/posto/login');
    return;
  }

  if (host === OFICINA_HOST && (req.path === '/' || req.path === '/login')) {
    res.redirect(302, '/oficina/login');
    return;
  }

  next();
});

const staticOptions = {
  immutable: true,
  maxAge: '1y',
  index: false,
};

app.use('/assets', (req, res, next) => {
  const dist = isSuperadminRequest(req) ? adminDist : webDist;
  express.static(path.join(dist, 'assets'), staticOptions)(req, res, next);
});

app.use((req, res, next) => {
  const dist = isSuperadminRequest(req) ? adminDist : webDist;
  express.static(dist, { ...staticOptions, index: false })(req, res, next);
});

app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ message: 'Endpoint não encontrado.' });
    return;
  }

  const dist = isSuperadminRequest(req) ? adminDist : webDist;
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(dist, 'index.html'), (error) => {
    if (error) next(error);
  });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Exattus Rotta]', error);
  if (!res.headersSent) {
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Exattus Rotta disponível na porta ${port}.`);
});

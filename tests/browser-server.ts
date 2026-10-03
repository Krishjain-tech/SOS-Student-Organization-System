import { seedDemo } from '../scripts/seed.js';
import { createApp } from '../apps/api/src/app.js';
import { closeDb } from '../apps/api/src/db/index.js';
await seedDemo();
const app = createApp();
const server = app.listen(3107, '127.0.0.1', () => console.log('Isolated browser API ready.'));
const stop = () => server.close(() => Promise.resolve(app.locals.close()).finally(() => { closeDb(); process.exit(0); }));
process.on('SIGTERM', stop); process.on('SIGINT', stop);

import 'dotenv/config';
import { createApp } from './app.js';
import { closeDb } from './db/index.js';
import { runRenewalReminders } from './routes/operations.js';

const app=createApp(),port=Number(process.env.PORT||3001);
const server=app.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Skyline API listening on http://${process.env.HOST||'127.0.0.1'}:${port}`));
const reminders=()=>{try {runRenewalReminders();} catch(error) {console.error('Renewal reminder job failed:',error instanceof Error?error.message:'Unknown error');}};
reminders();
const reminderTimer=setInterval(reminders,60*60*1000);reminderTimer.unref();
const stop=()=>{clearInterval(reminderTimer);server.close(()=>{Promise.resolve(app.locals.close()).finally(()=>{closeDb();process.exit(0);});});};
process.on('SIGINT',stop);process.on('SIGTERM',stop);

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export default async function teardown() {
  const target = process.env.SKYLINE_BROWSER_TEMP;
  if (!target || path.dirname(path.resolve(target)) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith('skyline-browser-tests-')) throw new Error('Unsafe browser-test cleanup path.');
  // Playwright shuts down its managed servers after teardown; Windows may retain open files until then.
  try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* OS temp cleanup can remove any still-open files after server shutdown. */ }
}

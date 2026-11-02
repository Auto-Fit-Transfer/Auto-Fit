// Load the same isolated schema used by PGlite checks into the dedicated PostgreSQL container.
// Run: node backend/tests/support/load_docker_schema.mjs <folder with 20260917 integrity SQL>
import { spawnSync } from 'node:child_process';
import { loadAutofitSchema } from './autofit_schema.mjs';

const CONTAINER = 'autofit-community-check-20261014';
const integrityDir = process.argv[2];
if (!integrityDir) throw new Error('Pass the folder with the 20260917 integrity SQL files');

const db = {
  async exec(sql) {
    const result = spawnSync(
      'docker',
      ['exec', '-i', CONTAINER, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1',
        '-h', '/tmp', '-U', 'postgres', '-d', 'postgres'],
      { input: sql, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    );
    if (result.error || result.status !== 0) {
      throw new Error(result.error?.message ?? (result.stderr.trim() || 'psql failed'));
    }
  },
};

const files = await loadAutofitSchema(db, integrityDir);
console.log(`Loaded ${files.length} migrations into ${CONTAINER}.`);

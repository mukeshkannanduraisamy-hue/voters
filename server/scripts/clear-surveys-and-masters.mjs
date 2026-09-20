import { pool } from '../src/lib/db.js';

async function main() {
  try {
    console.log('--- 1. Clearing Survey Data ---');
    const [delAns] = await pool.query('DELETE FROM vms_survey_answers');
    console.log(`vms_survey_answers rows deleted: ${delAns.affectedRows}`);

    const [delVal] = await pool.query('DELETE FROM vms_survey_field_values');
    console.log(`vms_survey_field_values rows deleted: ${delVal.affectedRows}`);

    const [delSurv] = await pool.query('DELETE FROM vms_voter_surveys');
    console.log(`vms_voter_surveys rows deleted: ${delSurv.affectedRows}`);

    console.log('\n--- 2. Clearing Masters (Caste, Job, Education) ---');
    const [delCaste] = await pool.query('DELETE FROM vms_caste_master');
    await pool.query('ALTER TABLE vms_caste_master AUTO_INCREMENT = 1');
    console.log(`vms_caste_master rows deleted: ${delCaste.affectedRows}`);

    const [delJob] = await pool.query('DELETE FROM vms_job_master');
    await pool.query('ALTER TABLE vms_job_master AUTO_INCREMENT = 1');
    console.log(`vms_job_master rows deleted: ${delJob.affectedRows}`);

    const [delEdu] = await pool.query('DELETE FROM vms_education_master');
    await pool.query('ALTER TABLE vms_education_master AUTO_INCREMENT = 1');
    console.log(`vms_education_master rows deleted: ${delEdu.affectedRows}`);

    console.log('\n--- 3. Cleaning Audit Logs & Outbox ---');
    const [delAudit] = await pool.query(
      `DELETE FROM vms_audit_log WHERE entity IN (
        'voter_survey', 'survey_answers', 'survey_field_values',
        'caste_master', 'job_master', 'education_master'
      )`
    );
    console.log(`vms_audit_log entries deleted: ${delAudit.affectedRows}`);

    try {
      await pool.query(
        `DELETE FROM vms_sync_outbox WHERE table_name IN (
          'voter_surveys', 'survey_answers', 'caste_master', 'job_master', 'education_master'
        )`
      );
    } catch {}

    console.log('\n--- 4. Verification ---');
    const [sCount] = await pool.query('SELECT COUNT(*) c FROM vms_voter_surveys');
    const [cCount] = await pool.query('SELECT COUNT(*) c FROM vms_caste_master');
    const [jCount] = await pool.query('SELECT COUNT(*) c FROM vms_job_master');
    const [eCount] = await pool.query('SELECT COUNT(*) c FROM vms_education_master');
    const [pCount] = await pool.query('SELECT COUNT(*) c FROM vms_party_master');

    console.log({
      remaining_surveys: sCount[0].c,
      remaining_caste_master: cCount[0].c,
      remaining_job_master: jCount[0].c,
      remaining_education_master: eCount[0].c,
      party_master_preserved: pCount[0].c,
    });

    console.log('\nAll survey entries, Caste Master, Job Master, and Education Master have been cleared successfully.');
  } catch (err) {
    console.error('Error during cleanup:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

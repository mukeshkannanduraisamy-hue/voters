import { db, pool } from '../src/lib/db.js';

async function main() {
  try {
    const surveysBefore = (await db.prepare('SELECT count(*) c FROM voter_surveys').get())?.c ?? 0;
    const customValuesBefore = (await db.prepare('SELECT count(*) c FROM survey_field_values').get())?.c ?? 0;
    const customAnswersBefore = (await db.prepare('SELECT count(*) c FROM survey_answers').get())?.c ?? 0;

    console.log(`Surveys before: ${surveysBefore}`);
    console.log(`Custom field values before: ${customValuesBefore}`);
    console.log(`Custom answers before: ${customAnswersBefore}`);

    await db.exec('DELETE FROM survey_answers');
    await db.exec('DELETE FROM survey_field_values');
    await db.exec('DELETE FROM voter_surveys');
    await db.exec("DELETE FROM sync_outbox WHERE table_name IN ('voter_surveys', 'survey_field_values', 'survey_answers')");
    await db.exec("DELETE FROM audit_log WHERE entity IN ('voter_survey', 'survey_answers')");

    const surveysAfter = (await db.prepare('SELECT count(*) c FROM voter_surveys').get())?.c ?? 0;
    const customValuesAfter = (await db.prepare('SELECT count(*) c FROM survey_field_values').get())?.c ?? 0;
    const customAnswersAfter = (await db.prepare('SELECT count(*) c FROM survey_answers').get())?.c ?? 0;

    console.log(`Surveys after: ${surveysAfter}`);
    console.log(`Custom field values after: ${customValuesAfter}`);
    console.log(`Custom answers after: ${customAnswersAfter}`);
    console.log('Survey data cleared successfully.');
  } catch (err) {
    console.error('Error clearing survey data:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

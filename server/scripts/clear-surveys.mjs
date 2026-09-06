import { db } from '../src/lib/db.js';

console.log('Surveys before:', db.prepare('SELECT count(*) c FROM voter_surveys').get().c);
console.log('Custom values before:', db.prepare('SELECT count(*) c FROM survey_field_values').get().c);

db.exec('DELETE FROM survey_field_values');
db.exec('DELETE FROM voter_surveys');
db.exec("DELETE FROM sync_outbox WHERE table_name = 'voter_surveys' OR table_name = 'survey_field_values'");
db.exec("DELETE FROM audit_log WHERE entity = 'voter_survey'");

console.log('Surveys after:', db.prepare('SELECT count(*) c FROM voter_surveys').get().c);
console.log('Custom values after:', db.prepare('SELECT count(*) c FROM survey_field_values').get().c);
console.log('Survey data cleared successfully.');

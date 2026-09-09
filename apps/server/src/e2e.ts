/**
 * End-to-end walk of the whole learner journey, against the real HTTP API:
 *
 *   health → curriculum → open lesson → mark theory seen → answer a quiz →
 *   open lab → start attempt → interact (login, IDOR, capture flag) →
 *   reveal a hint → submit → see mastery move and the next lesson unlock →
 *   ask the tutor → fix the vuln and prove the 403.
 *
 * Run with `pnpm --filter @cyberlab/server e2e`. It boots the server in-process
 * on an ephemeral DB, so it needs nothing external and asserts as it goes.
 */
import { loadConfig } from './config.js';
import { buildServices } from './services.js';
import { buildApp } from './app.js';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${name} ${detail}`);
  }
}

async function main(): Promise<void> {
  process.env['CYBERLAB_DB'] = ':memory:';
  process.env['AI_PROVIDER'] = 'offline';
  const config = loadConfig();
  const services = await buildServices(config);
  const app = await buildApp(services);
  const H = { 'content-type': 'application/json', 'x-cyberlab-user': 'e2e' };

  const j = async (method: string, url: string, body?: unknown) => {
    const res = await app.inject({ method: method as 'GET', url, headers: H, ...(body ? { payload: JSON.stringify(body) } : {}) });
    return { status: res.statusCode, body: res.json() as any };
  };

  console.log('\n── CyberLab end-to-end ──\n');

  // 1. health & curriculum
  const health = await j('GET', '/api/health');
  check('health ok', health.body.ok === true);
  // Not a hard-coded count: `ready` grows every time a lesson gains a real lab,
  // and an assertion pinned to today's number fails on the next one instead of
  // catching anything. What matters is that some lesson is genuinely playable.
  check('has ready lessons', health.body.curriculum.ready >= 3, `got ${health.body.curriculum.ready}`);

  const cur = await j('GET', '/api/curriculum');
  check('curriculum has 11 levels', cur.body.levels.length === 11);
  check('BAC lesson available', cur.body.lessonStates['web.broken-access-control'] === 'available');
  check('SQLi lesson locked (prereq)', cur.body.lessonStates['web.sql-injection'] === 'locked');

  // 2. open the flagship lesson
  const lesson = await j('GET', '/api/lessons/web.broken-access-control');
  check('lesson entry allowed', lesson.body.entry.allowed === true);
  check('lesson has a lab', Boolean(lesson.body.lab));
  check('lesson has 3 exercises', lesson.body.exercises.length === 3);
  check('lesson position 2/2 in module', lesson.body.position.total === 2);

  // 3. theory seen + quiz
  const blockIds = lesson.body.lesson.theory.map((b: any) => b.id);
  await j('POST', '/api/lessons/x/seen', { lessonId: 'web.broken-access-control', blockIds });
  const quiz = await j('POST', '/api/lessons/x/quiz', {
    lessonId: 'web.broken-access-control',
    blockId: 'b-quiz-1',
    selected: ['b'],
  });
  check('quiz graded correct', quiz.body.correct === true);

  const progAfterTheory = await j('GET', '/api/progress');
  check('xp gained from theory+quiz', progAfterTheory.body.progress.xp > 0);
  check('lesson now in-progress', progAfterTheory.body.lessonStates['web.broken-access-control'] === 'in-progress');

  // 4. open lab
  const lab = await j('POST', '/api/labs', { specId: 'lab.vault', seed: 'e2e-seed' });
  check('lab created', lab.body.state.status === 'ready');
  const labId = lab.body.state.instanceId;

  // 5. start attempt for the exploit mission
  const attempt = await j('POST', '/api/attempts', { exerciseId: 'ex.bac.exploit', labInstanceId: labId });
  check('attempt started', Boolean(attempt.body.attemptId));
  const attemptId = attempt.body.attemptId;

  // 6. interact: login then IDOR across all users
  await j('POST', `/api/labs/${labId}/actions`, {
    type: 'browser.submit',
    path: '/login.php',
    method: 'POST',
    fields: { username: 'seba', password: 'PrimaveraFredda!24' },
  });
  let lastPreview: any;
  for (const id of [15, 11, 12, 13, 14, 16, 17, 18, 19]) {
    const act = await j('POST', `/api/labs/${labId}/actions`, {
      type: 'http.request',
      method: 'GET',
      path: `/profile.php?id=${id}`,
      headers: {},
      useCookieJar: true,
    });
    lastPreview = act.body.preview;
  }
  check('live objective preview present', Boolean(lastPreview));
  check('bypass objective shows passed live', lastPreview.objectives.some((o: any) => o.id === 'o-bypass' && o.passed));

  const labState = await j('GET', `/api/labs/${labId}`);
  check('flag captured in lab state', labState.body.state.flags.some((f: string) => f.startsWith('CL{')));
  check('bypass signal raised', labState.body.state.signals.some((s: any) => s.name === 'authz.horizontal.bypass'));

  // 7. reveal one hint (costs evidence weight)
  const hint = await j('POST', `/api/attempts/${attemptId}/hint`, { hintId: 'h1' });
  check('hint revealed', Boolean(hint.body.hint));

  // 8. submit
  const submit = await j('POST', `/api/attempts/${attemptId}/submit`, { report: { parameter: 'id', severity: 'both' } });
  check('attempt passed', submit.body.evaluation.passed === true, `score=${submit.body.evaluation?.score}`);
  check('all criteria passed', submit.body.evaluation.criteria.every((c: any) => c.passed));
  check('mastery moved', submit.body.masteryDeltas.length > 0);
  const idorDelta = submit.body.masteryDeltas.find((d: any) => d.skillId === 'idor');
  check('idor mastery increased', Boolean(idorDelta) && idorDelta.after > idorDelta.before);
  check('xp awarded', submit.body.progress.progress.xp > progAfterTheory.body.progress.xp);
  check('first-exploit badge earned', submit.body.newBadges.includes('badge.first-exploit'));

  // 9. tutor (offline) — explain mode reads the real signals
  const tutor = await j('POST', '/api/tutor/once', {
    mode: 'explain',
    lessonId: 'web.broken-access-control',
    exerciseId: 'ex.bac.exploit',
    history: [],
  });
  check('tutor responded', tutor.body.content.length > 40);
  check('tutor is offline-deterministic', tutor.body.offline === true);

  // 10. fix flow: recon exercise then fix, to complete the lesson
  const reconAttempt = await j('POST', '/api/attempts', { exerciseId: 'ex.bac.recon', labInstanceId: labId });
  await j('POST', `/api/attempts/${reconAttempt.body.attemptId}/submit`, {});
  // recon should pass from the session+own-profile already in transcript
  const fixAttempt = await j('POST', '/api/attempts', { exerciseId: 'ex.bac.fix', labInstanceId: labId });
  await j('POST', `/api/labs/${labId}/actions`, {
    type: 'editor.write',
    path: '/srv/vault/policy.json',
    content: JSON.stringify({
      version: 2,
      routes: {
        '/profile.php': { requireSession: true, ownership: 'match:query.id' },
        '/documents.php': { requireSession: true, ownership: 'match:query.id' },
        '/admin.php': { requireSession: true, ownership: 'role:admin' },
        '/dashboard.php': { requireSession: true, ownership: 'none' },
      },
    }),
  });
  const deniedAction = await j('POST', `/api/labs/${labId}/actions`, {
    type: 'http.request', method: 'GET', path: '/profile.php?id=17', headers: {}, useCookieJar: true,
  });
  check('other profile now 403 after fix', deniedAction.body.result.response.status === 403);
  await j('POST', `/api/labs/${labId}/actions`, {
    type: 'http.request', method: 'GET', path: '/profile.php?id=15', headers: {}, useCookieJar: true,
  });
  const fixSubmit = await j('POST', `/api/attempts/${fixAttempt.body.attemptId}/submit`, {});
  check('fix attempt passed', fixSubmit.body.evaluation.passed === true, `score=${fixSubmit.body.evaluation?.score}`);
  check('defender badge earned', fixSubmit.body.newBadges.includes('badge.defender') || services.progress.get('e2e').badges.includes('badge.defender'));

  // 11. lesson completion unlocks the SQLi lesson
  const finalProg = await j('GET', '/api/progress');
  const bacState = finalProg.body.lessonStates['web.broken-access-control'];
  check('BAC lesson completed or mastered', bacState === 'completed' || bacState === 'mastered', `state=${bacState}`);
  check('SQLi lesson now unlocked', finalProg.body.lessonStates['web.sql-injection'] === 'available', `state=${finalProg.body.lessonStates['web.sql-injection']}`);

  // 12. reset determinism
  const reset = await j('POST', `/api/labs/${labId}/reset`);
  check('lab reset clears events', reset.body.state.eventCount === 0);
  check('lab reset clears flags', reset.body.state.flags.length === 0);

  // 13. generator
  const gen = await j('POST', '/api/exercises/generate', { lessonId: 'web.broken-access-control', difficultyShift: 2 });
  check('generated a harder challenge', gen.body.exercise.difficulty === 'expert' || gen.body.exercise.difficulty === 'advanced');

  await app.close();
  await services.dispose();

  console.log(`\n── ${passed} passed, ${failed} failed ──\n`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('e2e crashed:', error);
  process.exit(1);
});

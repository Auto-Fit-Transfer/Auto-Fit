const statusLabel = document.getElementById('connection-label');
const statusMeta = statusLabel.parentElement;
const statusNodes = {
  migrations: document.getElementById('migration-count'),
  oldStart: document.getElementById('old-start'),
  aiStart: document.getElementById('ai-start'),
  guard: document.getElementById('archive-guard'),
};
const resultPanel = document.getElementById('result-panel');
const resultTitle = document.getElementById('result-title');
const resultState = document.getElementById('result-state');
const resultDescription = document.getElementById('result-description');
const resultOutput = document.getElementById('result-output');
const runButtons = [...document.querySelectorAll('[data-case]')];
const domainButton = document.getElementById('run-domain');
const allButton = document.getElementById('run-all');
const navButtons = [...document.querySelectorAll('[data-tab]')];
const screens = [...document.querySelectorAll('.app-screen')];
const phoneScroll = document.querySelector('.phone-scroll');
const suiteCases = ['api_all', 'ai_all', 'ocr_all', 'sql_domains', 'archive', 'upgrade', 'stack'];
const labels = {
  api_all: 'API 전체', ai_all: 'AI 서비스', ocr_all: 'OCR 서버', sql_domains: '도메인 DB 14종',
  archive: 'DB 보관 정책', upgrade: 'DB 업그레이드', stack: '배포 설정',
  domain_home: '홈·계정 API', domain_diet: '식단·건강 API',
  domain_exercise: '운동·러닝 API', domain_community: '커뮤니티·채팅 API',
  domain_my: '마이·설정 API',
};
const domains = {
  home: ['홈·계정 검증', '홈, 건강 리포트, 사용자 설정 API 테스트'],
  diet: ['식단·건강 검증', '주간 식단, 식사 사진, 건강 문서 API 테스트'],
  exercise: ['운동·러닝 검증', 'AI 운동, 러닝, 자세 분석, 보관 정책 API 테스트'],
  community: ['커뮤니티·채팅 검증', '게시글, 마일리지, 채팅 저장 API 테스트'],
  my: ['마이·설정 검증', '계정 삭제, 사용자 설정, 보안 API 테스트'],
};
let activeTab = 'home';
let running = false;

function mark(node, value, good) {
  node.textContent = value;
  node.className = good ? 'ok' : 'bad';
}

async function refreshStatus() {
  statusLabel.textContent = '로컬 DB 상태 확인 중';
  statusMeta.className = 'connection';
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '상태를 확인할 수 없습니다.');
    const migrationsGood = data.applied_migrations === data.expected_migrations;
    mark(statusNodes.migrations, `${data.applied_migrations} / ${data.expected_migrations} 적용`, migrationsGood);
    mark(statusNodes.oldStart, data.old_start_removed ? '제거됨' : '남아 있음', data.old_start_removed);
    mark(statusNodes.aiStart, data.ai_start_available ? '사용 가능' : '사용 불가', data.ai_start_available);
    mark(statusNodes.guard, data.archive_constraint && data.derived_write_guard ? '활성' : '확인 필요', data.archive_constraint && data.derived_write_guard);
    const ready = migrationsGood && data.old_start_removed && data.ai_start_available && data.archive_constraint && data.derived_write_guard;
    statusLabel.textContent = ready ? '로컬 DB 검증 준비 완료' : '로컬 DB에서 확인할 항목이 있습니다';
    statusMeta.className = ready ? 'connection ready' : 'connection failed';
  } catch (error) {
    Object.values(statusNodes).forEach(node => mark(node, '연결 실패', false));
    statusLabel.textContent = error.message;
    statusMeta.className = 'connection failed';
  }
}

function switchTab(tab) {
  if (!(tab in domains)) return;
  activeTab = tab;
  screens.forEach(screen => { screen.hidden = screen.id !== `screen-${tab}`; });
  navButtons.forEach(button => {
    const selected = button.dataset.tab === tab;
    button.classList.toggle('nav-active', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.getElementById('domain-title').textContent = domains[tab][0];
  document.getElementById('domain-description').textContent = domains[tab][1];
  phoneScroll.scrollTop = 0;
}

function setBusy(value) {
  running = value;
  [...runButtons, domainButton, allButton].forEach(button => { button.disabled = value; });
}

function setSuiteState(selected, state, summary = '') {
  const row = document.querySelector(`[data-suite="${selected}"]`);
  if (!row) return;
  const node = row.querySelector('.suite-state');
  node.className = `suite-state ${state}`;
  node.textContent = state === 'running' ? '실행 중' : state === 'passed' ? (summary || '통과') : state === 'failed' ? '실패' : '미실행';
}

async function executeCase(selected) {
  resultTitle.textContent = labels[selected];
  resultState.textContent = '실행 중';
  resultState.className = 'result-state running';
  resultDescription.textContent = '통합본의 로컬 테스트를 실행하고 있습니다. 잠시 기다려 주세요.';
  resultOutput.hidden = true;
  resultOutput.textContent = '';
  setSuiteState(selected, 'running');
  try {
    const response = await fetch('/api/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ case: selected }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '테스트를 실행할 수 없습니다.');
    const passed = data.passed === true;
    resultState.textContent = passed ? '통과' : '실패';
    resultState.className = passed ? 'result-state passed' : 'result-state failed';
    resultDescription.textContent = passed
      ? `${data.summary || '검증 완료'} · ${data.duration_seconds}초 · 로컬에서 실행한 결과입니다.`
      : '로컬 검증에 실패했습니다. 아래 출력을 확인하세요.';
    resultOutput.textContent = data.output || (passed ? '검증 완료 · 오류 없음' : '출력 없음');
    resultOutput.hidden = false;
    setSuiteState(selected, passed ? 'passed' : 'failed', data.summary);
    return { passed, summary: data.summary || (passed ? '통과' : '실패') };
  } catch (error) {
    resultState.textContent = '실행 실패';
    resultState.className = 'result-state failed';
    resultDescription.textContent = error.message;
    setSuiteState(selected, 'failed');
    return { passed: false, summary: error.message };
  }
}

async function runOne(selected) {
  if (running) return;
  setBusy(true);
  resultPanel.focus();
  try { await executeCase(selected); }
  finally { setBusy(false); }
}

async function runAll() {
  if (running) return;
  setBusy(true);
  resultPanel.focus();
  const results = [];
  try {
    for (const selected of suiteCases) {
      const outcome = await executeCase(selected);
      results.push(`${labels[selected]}: ${outcome.summary}`);
    }
    const passed = suiteCases.every(selected => document.querySelector(`[data-suite="${selected}"] .suite-state`).classList.contains('passed'));
    resultTitle.textContent = '전체 검증 결과';
    resultState.textContent = passed ? '모두 통과' : '확인 필요';
    resultState.className = passed ? 'result-state passed' : 'result-state failed';
    resultDescription.textContent = passed ? '7개 로컬 회귀·SQL 검증을 모두 통과했습니다. 실제 서비스 연동은 별도 확인이 필요합니다.' : '실패한 항목의 개별 실행 결과를 확인하세요.';
    resultOutput.textContent = results.join('\n');
    resultOutput.hidden = false;
  } finally { setBusy(false); }
}

document.getElementById('refresh-status').addEventListener('click', refreshStatus);
navButtons.forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.go)));
runButtons.forEach(button => button.addEventListener('click', () => runOne(button.dataset.case)));
domainButton.addEventListener('click', () => runOne(`domain_${activeTab}`));
allButton.addEventListener('click', runAll);
document.getElementById('open-history').addEventListener('click', () => {
  screens.forEach(screen => { screen.hidden = screen.id !== 'screen-history'; });
  phoneScroll.scrollTop = 0;
  document.getElementById('back-exercise').focus();
});
document.getElementById('back-exercise').addEventListener('click', () => {
  switchTab('exercise');
  document.getElementById('open-history').focus();
});
const kindToggle = document.getElementById('kind-toggle');
const kindMenu = document.getElementById('kind-menu');
kindToggle.addEventListener('click', () => {
  kindMenu.hidden = !kindMenu.hidden;
  kindToggle.setAttribute('aria-expanded', String(!kindMenu.hidden));
});
document.querySelectorAll('[data-feed]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-feed]').forEach(item => item.setAttribute('aria-selected', String(item === button)));
  document.querySelectorAll('.feed-panel').forEach(panel => { panel.hidden = panel.id !== `feed-${button.dataset.feed}`; });
}));
refreshStatus();

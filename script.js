// ============================================================
//  CONFUSED AD — 打鍵 + マウス情報で困惑スコアを推定
// ============================================================

// --- DOM ---
const screenStart  = document.getElementById('screenStart');
const screenMain   = document.getElementById('screenMain');
const screenResult = document.getElementById('screenResult');
const btnStart     = document.getElementById('btnStart');
const btnSubmit    = document.getElementById('btnSubmit');
const btnRetry     = document.getElementById('btnRetry');
const inputBox     = document.getElementById('inputBox');
const charCountEl  = document.getElementById('charCount');

const meterFill   = document.getElementById('meterFill');
const scoreNumEl  = document.getElementById('scoreNum');
const stateTxtEl  = document.getElementById('stateTxt');
const rhythmEl    = document.getElementById('rhythm');
const pauseCountEl  = document.getElementById('pauseCount');
const deleteCountEl = document.getElementById('deleteCount');
const backtrackEl   = document.getElementById('backtrack');
const mouseSpeedEl  = document.getElementById('mouseSpeed');
const stagnationEl  = document.getElementById('stagnation');
const hintBox       = document.getElementById('hintBox');

const adArea = document.getElementById('adArea');

// 結果
const resultScore  = document.getElementById('resultScore');
const resultState  = document.getElementById('resultState');
const resultDesc   = document.getElementById('resultDesc');
const resultText   = document.getElementById('resultText');
const resultAdBox  = document.getElementById('resultAdBox');

// ============================================================
//  状態変数
// ============================================================
let confusedScore = 0;
let currentTheme  = '';
let hasStarted    = false;

// 打鍵
let ikiValues   = [];
let pauseCount  = 0;
let deleteCount = 0;
let lastKeyTime = null;
let pauseTimer  = null;

// マウス
let lastMouseX = 0, lastMouseY = 0;
let mouseSpeedSamples = [];
let backtrackCount = 0;
let backtrackTimes = [];  // 往復が発生した時刻を記録
let prevDirX = 0;

// ============================================================
//  画面遷移
// ============================================================
btnStart.addEventListener('click', () => {
  screenStart.classList.add('hidden');
  screenMain.classList.remove('hidden');
  inputBox.focus();
});

btnRetry.addEventListener('click', () => {
  reset();
  screenResult.classList.add('hidden');
  screenMain.classList.remove('hidden');
  inputBox.focus();
});

// ============================================================
//  文字数カウント
// ============================================================
inputBox.addEventListener('input', () => {
  const len = inputBox.value.length;
  charCountEl.textContent = len;
  btnSubmit.disabled = len === 0;
});

// ============================================================
//  打鍵イベント
// ============================================================
inputBox.addEventListener('keydown', (e) => {
  const now = Date.now();
  hasStarted = true;

  // 削除キー
  if (e.key === 'Backspace' || e.key === 'Delete') {
    deleteCount++;
    deleteCountEl.textContent = `${deleteCount} 回`;
  }

  // IKI
  if (lastKeyTime !== null) {
    const iki = now - lastKeyTime;
    if (iki > 50 && iki < 4000) {
      ikiValues.push(iki);
      if (ikiValues.length > 40) ikiValues.shift();
    }
  }
  lastKeyTime = now;

  // 停止タイマー（2秒間打鍵なし → 停止カウント）
  clearTimeout(pauseTimer);
  pauseTimer = setTimeout(() => {
    if (inputBox.value.length > 0 && hasStarted) {
      pauseCount++;
      pauseCountEl.textContent = `${pauseCount} 回`;
    }
  }, 2000);
});

// ============================================================
//  マウスイベント
// ============================================================
document.addEventListener('mousemove', (e) => {
  // メイン画面が表示されているときだけ計測開始
  if (!screenMain.classList.contains('hidden')) {
    hasStarted = true;
  }

  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // 速度サンプル（px/event）
  mouseSpeedSamples.push(dist);
  if (mouseSpeedSamples.length > 20) mouseSpeedSamples.shift();

  // X方向の往復検知
  if (Math.abs(dx) > 8) {
    const dirX = dx > 0 ? 1 : -1;
    if (prevDirX !== 0 && dirX !== prevDirX) {
      backtrackCount++;
      backtrackTimes.push(Date.now());
    }
    prevDirX = dirX;
  }

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

// ============================================================
//  スコア計算（250msごと）
// ============================================================
setInterval(() => {
  if (!hasStarted) return;

  // --- 1. 打鍵間隔スコア（遅いほど高）---
  let ikiScore = 0;
  if (ikiValues.length > 1) {
    const avg = ikiValues.reduce((a, b) => a + b, 0) / ikiValues.length;
    // 150ms=0 〜 400ms=100 に急峻にマッピング
    ikiScore = Math.min(Math.max((avg - 150) / 2.5, 0), 100);
  }

  // --- 2. 停滞スコア（最後のキー入力から経過時間）---
  const elapsed = lastKeyTime ? Date.now() - lastKeyTime : 0;
  // 1秒超から加算、4秒で100に到達
  const stagnationScore = Math.min(Math.max((elapsed - 1000) / 30, 0), 100);
  const stagnationSec = (elapsed / 1000).toFixed(1);
  stagnationEl.textContent = elapsed > 500 ? `${stagnationSec} 秒` : '—';

  // --- 3. 停止回数スコア（1回=30pt, 上限90）---
  const pauseScore = Math.min(pauseCount * 30, 90);

  // --- 4. 削除スコア（1回=20pt, 上限80）---
  const deleteScore = Math.min(deleteCount * 20, 80);

  // --- 5. マウス往復スコア（累積・止まっても下がらない）---
  const btScore = Math.min(backtrackCount * 15, 90);
  backtrackEl.textContent = `${backtrackCount} 回`;

  // --- 6. マウス速度スコア（速い＝離脱 or 焦り → 困惑高）---
  let mouseScore = 0;
  if (mouseSpeedSamples.length > 3) {
    const avgSpeed = mouseSpeedSamples.reduce((a, b) => a + b, 0) / mouseSpeedSamples.length;
    mouseScore = Math.min(avgSpeed * 6, 80);
    mouseSpeedEl.textContent = avgSpeed < 3 ? '静止' : avgSpeed < 8 ? '遅い' : avgSpeed < 18 ? '速い' : '非常に速い';
  }

  // --- 合成（打鍵＋停滞＋マウスをバランスよく）---
  const raw = ikiScore        * 0.28
            + stagnationScore * 0.26
            + pauseScore      * 0.14
            + deleteScore     * 0.10
            + btScore         * 0.13
            + mouseScore      * 0.09;

  // 平滑化（上昇は素早く、下降はゆっくり）
  const target = Math.min(raw, 100);
  if (target > confusedScore) {
    confusedScore = confusedScore * 0.55 + target * 0.45;
  } else {
    confusedScore = confusedScore * 0.85 + target * 0.15;
  }

  updateUI();
}, 250);

// ============================================================
//  UI更新
// ============================================================
function updateUI() {
  const s = Math.round(confusedScore);

  // ゲージ
  scoreNumEl.textContent   = s;
  meterFill.style.width    = `${s}%`;
  const hue = 140 - s * 1.4;
  meterFill.style.background = `hsl(${hue}, 75%, 52%)`;
  scoreNumEl.style.color     = `hsl(${hue}, 75%, 60%)`;

  // 打鍵リズム表示
  if (ikiValues.length > 1) {
    const avg = ikiValues.reduce((a, b) => a + b, 0) / ikiValues.length;
    rhythmEl.textContent = avg < 230 ? '速い' : avg < 480 ? '普通' : avg < 850 ? '遅い' : '詰まっている';
  }

  // テーマ判定
  let theme, stateText;
  if (s < 25) {
    theme     = 'focused';
    stateText = '集中して入力しています';
  } else if (s < 52) {
    theme     = '';
    stateText = '読み取り中...';
  } else if (s < 76) {
    theme     = 'confused';
    stateText = '困惑を検知しています';
  } else {
    theme     = 'disengaged';
    stateText = '離脱の兆候があります';
  }

  stateTxtEl.textContent = stateText;

  // 困惑時にヒント表示・強度調整
  if (s >= 60) {
    hintBox.classList.remove('hidden');
    if (s >= 80) {
      hintBox.classList.add('strong');
    } else {
      hintBox.classList.remove('strong');
    }
  } else {
    hintBox.classList.add('hidden');
    hintBox.classList.remove('strong');
  }

  if (theme !== currentTheme) {
    currentTheme = theme;
    applyTheme(theme);
  }
}

// ============================================================
//  広告テーマ適用（テキスト固定・クラスのみ変更）
// ============================================================
function applyTheme(theme) {
  adArea.classList.remove('focused', 'confused', 'disengaged');
  if (theme) adArea.classList.add(theme);
}

// ============================================================
//  送信
// ============================================================
btnSubmit.addEventListener('click', () => {
  clearTimeout(pauseTimer);
  showResult();
});

function showResult() {
  const s    = Math.round(confusedScore);
  const text = inputBox.value.trim();

  let stateLabel, desc, adComment;
  if (s < 25) {
    stateLabel = '集中型';
    desc       = '打鍵リズムが安定し、マウスも落ち着いていました。この広告コピーはあなたにとって読みやすく、スムーズに意味を理解できたようです。';
    adComment  = '集中状態を検知した広告は、より詳細なコピーとブルーのハイライトでキーワードを強調しました。';
  } else if (s < 52) {
    stateLabel = '標準型';
    desc       = '平均的な困惑スコアです。大きな詰まりはなく、概ね自然に読めていたようです。';
    adComment  = '目立った状態変化がなかったため、広告はデフォルトのまま表示されました。';
  } else if (s < 76) {
    stateLabel = '困惑型';
    desc       = '打鍵の詰まりや削除、マウスの往復が複数回検知されました。広告は重要キーワードをハイライトして、理解を助けようとしました。';
    adComment  = '困惑を検知した瞬間、「体重移動」「上昇気流」「感性」という3つのキーワードが光り、背景が赤みを帯びました。';
  } else {
    stateLabel = '離脱型';
    desc       = '強い困惑または離脱傾向が検知されました。テキストの意味をつかむことが難しかったようです。';
    adComment  = '離脱を検知した広告はテキストを薄くし、イラストのトーンを落として「読まなくてもいい」という信号を送りました。';
  }

  screenMain.classList.add('hidden');
  screenResult.classList.remove('hidden');

  resultScore.textContent = s;
  const hue = 140 - s * 1.4;
  resultScore.style.color = `hsl(${hue}, 75%, 60%)`;

  resultState.textContent = stateLabel;
  resultDesc.textContent  = desc;
  resultText.textContent  = text || '（未入力）';
  resultAdBox.innerHTML   = `<strong>広告はどう変化したか</strong><p>${adComment}</p>`;
}

// ============================================================
//  リセット
// ============================================================
function reset() {
  confusedScore = 0; currentTheme = ''; hasStarted = false;
  ikiValues = []; pauseCount = 0; deleteCount = 0;
  lastKeyTime = null; clearTimeout(pauseTimer);
  mouseSpeedSamples = []; backtrackCount = 0; backtrackTimes = []; prevDirX = 0;

  inputBox.value              = '';
  charCountEl.textContent     = '0';
  btnSubmit.disabled          = true;
  scoreNumEl.textContent      = '0';
  meterFill.style.width       = '0%';
  stateTxtEl.textContent      = '入力を始めると計測が始まります';
  rhythmEl.textContent        = '—';
  stagnationEl.textContent    = '—';
  pauseCountEl.textContent    = '0 回';
  deleteCountEl.textContent   = '0 回';
  backtrackEl.textContent     = '0 回';
  mouseSpeedEl.textContent    = '—';
  hintBox.classList.add('hidden');

  applyTheme('');
}

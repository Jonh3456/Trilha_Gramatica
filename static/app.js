/* ==========================================================================
   Trilha Gramatical — engine (com autenticação e sincronização Supabase)
   ========================================================================== */

const STORAGE_KEY = "trilha_gramatical_progress_v1";

let progress = { score: 0, energy: 100, unitsCompleted: {}, lastUnit: null };
let session = null; // active lesson session state (not to be confused with auth session)

function loadLocalProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return { score: 0, energy: 100, unitsCompleted: {}, lastUnit: null };
}
function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  if (typeof pushRemoteProgressDebounced === "function") pushRemoteProgressDebounced(progress);
}

function applyTheme() {
  const saved = localStorage.getItem("trilha_theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
}
applyTheme();

const views = {
  home: document.getElementById("view-home"),
  chapter: document.getElementById("view-chapter"),
  lesson: document.getElementById("view-lesson"),
  summary: document.getElementById("view-summary"),
  account: document.getElementById("view-account"),
};
function showView(name) {
  Object.values(views).forEach(v => v.classList.add("hidden"));
  views[name].classList.remove("hidden");
  window.scrollTo(0, 0);
}
function updateHeaderStats() {
  document.getElementById("statScore").textContent = progress.score;
  document.getElementById("statEnergy").textContent = Math.max(0, Math.min(100, progress.energy));
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 2200);
}

// ---------------------------------------------------------------------------
// AUTH FLOW — gates the app behind login
// ---------------------------------------------------------------------------
async function bootApp() {
  const client = initSupabase();
  if (!client) {
    // Supabase not configured (or unreachable): fall back to local-only mode
    // so the app is still fully usable without login.
    progress = loadLocalProgress();
    document.getElementById("view-auth").classList.add("hidden");
    document.getElementById("appRoot").classList.remove("hidden");
    document.getElementById("btnAccount").classList.add("hidden");
    enterApp();
    return;
  }
  const existing = await restoreSession();
  if (existing) {
    await onLoggedIn();
  } else {
    document.getElementById("view-auth").classList.remove("hidden");
    document.getElementById("appRoot").classList.add("hidden");
  }
}

async function onLoggedIn() {
  document.getElementById("view-auth").classList.add("hidden");
  document.getElementById("appRoot").classList.remove("hidden");
  const remote = await fetchRemoteProgress();
  const local = loadLocalProgress();
  // Merge strategy: prefer remote if it exists (source of truth across devices);
  // otherwise seed the cloud with local progress.
  if (remote) {
    progress = remote;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } else {
    progress = local;
    pushRemoteProgress(progress);
  }
  document.getElementById("accountEmail").textContent = currentSession.user.email;
  enterApp();
}

function enterApp() {
  updateHeaderStats();
  renderHome();
  showView("home");
}

document.getElementById("formLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const ok = await doLogin(email, password);
  if (ok) await onLoggedIn();
});

document.getElementById("formSignup").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const ok = await doSignup(email, password);
  if (ok) await onLoggedIn();
});

document.getElementById("btnToggleAuthMode").addEventListener("click", () => {
  const loginForm = document.getElementById("formLogin");
  const signupForm = document.getElementById("formSignup");
  const btn = document.getElementById("btnToggleAuthMode");
  clearAuthMessage();
  if (loginForm.classList.contains("hidden")) {
    loginForm.classList.remove("hidden");
    signupForm.classList.add("hidden");
    btn.textContent = "Ainda não tem conta? Criar conta";
  } else {
    loginForm.classList.add("hidden");
    signupForm.classList.remove("hidden");
    btn.textContent = "Já tem conta? Entrar";
  }
});

document.getElementById("btnAccount").addEventListener("click", () => {
  document.getElementById("accountEmail").textContent = currentSession ? currentSession.user.email : "";
  showView("account");
});
document.getElementById("btnBackFromAccount").addEventListener("click", () => { renderHome(); showView("home"); });

document.getElementById("formChangePassword").addEventListener("submit", async (e) => {
  e.preventDefault();
  const cur = document.getElementById("curPassword").value;
  const n1 = document.getElementById("newPassword").value;
  const n2 = document.getElementById("newPassword2").value;
  const msgEl = document.getElementById("accountMessage");
  msgEl.classList.remove("hidden", "auth-error", "auth-success");
  if (n1 !== n2) {
    msgEl.textContent = "As senhas novas não coincidem.";
    msgEl.classList.add("auth-error");
    return;
  }
  const ok = await doChangePassword(cur, n1);
  msgEl.textContent = ok ? "Senha alterada com sucesso!" : "Não foi possível trocar a senha. Verifique a senha atual.";
  msgEl.classList.add(ok ? "auth-success" : "auth-error");
  if (ok) e.target.reset();
});

document.getElementById("btnLogout").addEventListener("click", async () => {
  await doLogout();
  location.reload();
});

// ---------------------------------------------------------------------------
// Home: chapter list
// ---------------------------------------------------------------------------
function isChapterUnlocked(chapterIdx) {
  if (chapterIdx === 0) return true;
  const prevChapter = CONTENT.chapters[chapterIdx - 1];
  return prevChapter.lessons.every(l => progress.unitsCompleted[l.id]);
}
function chapterProgressPct(chapter) {
  const total = chapter.lessons.length;
  const done = chapter.lessons.filter(l => progress.unitsCompleted[l.id]).length;
  return total ? Math.round((done / total) * 100) : 0;
}
function renderHome() {
  const list = document.getElementById("chapterList");
  list.innerHTML = "";
  CONTENT.chapters.forEach((ch, idx) => {
    const unlocked = isChapterUnlocked(idx);
    const pct = chapterProgressPct(ch);
    const card = document.createElement("button");
    card.className = "chapter-card" + (unlocked ? "" : " locked");
    card.setAttribute("role", "listitem");
    card.disabled = !unlocked;
    card.innerHTML = `
      <span class="chip">Capítulo ${idx + 1}</span>
      <h3>${ch.title}</h3>
      <span class="meta">${ch.lessons.length} unidades · ${pct}% concluído</span>
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
    `;
    card.addEventListener("click", () => { if (unlocked) openChapter(idx); });
    list.appendChild(card);
  });
}
function openChapter(idx) {
  const ch = CONTENT.chapters[idx];
  document.getElementById("chapterTitle").textContent = `Capítulo ${idx + 1} — ${ch.title}`;
  document.getElementById("chapterSubtitle").textContent = `Unidades ${ch.unitRange[0]}–${ch.unitRange[1]} do livro`;
  const list = document.getElementById("unitList");
  list.innerHTML = "";
  ch.lessons.forEach((lesson, i) => {
    const done = !!progress.unitsCompleted[lesson.id];
    const prevDone = i === 0 || !!progress.unitsCompleted[ch.lessons[i - 1].id];
    const unlocked = done || prevDone;
    const node = document.createElement("button");
    node.className = "unit-node" + (done ? " done" : unlocked ? " current" : " locked");
    node.disabled = !unlocked;
    node.setAttribute("role", "listitem");
    const markSymbol = done ? "✓" : lesson.unitNumber;
    node.innerHTML = `
      <span class="node-mark">${markSymbol}</span>
      <span class="node-info">
        <h4>Unidade ${lesson.unitNumber} — ${lesson.title}</h4>
        <span class="node-meta">${lesson.exercises.length} exercícios · págs. ${lesson.sourcePages[0]}–${lesson.sourcePages[1]}</span>
      </span>
      <span class="node-arrow" aria-hidden="true">→</span>
    `;
    node.addEventListener("click", () => { if (unlocked) startLesson(ch, lesson); });
    list.appendChild(node);
  });
  showView("chapter");
}

// ---------------------------------------------------------------------------
// Lesson session
// ---------------------------------------------------------------------------
function startLesson(chapter, lesson) {
  const queue = lesson.exercises.map((ex) => ({ ex, attempts: 0 }));
  session = {
    chapter, lesson, queue,
    total: queue.length,
    completedCount: 0,
    firstTryCorrect: 0,
    reviewedCount: 0,
    lastLessonScore: 0,
    current: null,
    checked: false,
  };
  progress.lastUnit = lesson.id;
  saveProgress();
  nextExercise();
  showView("lesson");
}
function nextExercise() {
  if (session.queue.length === 0) { finishLesson(); return; }
  session.current = session.queue.shift();
  session.checked = false;
  renderProgress();
  renderExercise(session.current.ex);
  document.getElementById("btnCheck").classList.remove("hidden");
  document.getElementById("btnCheck").disabled = true;
  document.getElementById("btnContinue").classList.add("hidden");
  const banner = document.getElementById("feedbackBanner");
  banner.classList.add("hidden");
  banner.textContent = "";
}
function renderProgress() {
  const doneSoFar = session.completedCount;
  const totalKnownNow = doneSoFar + session.queue.length + 1;
  const pct = Math.round((doneSoFar / totalKnownNow) * 100);
  document.getElementById("progressFill").style.width = pct + "%";
  document.getElementById("progressBar").setAttribute("aria-valuenow", pct);
  document.getElementById("progressLabel").textContent = `Exercício ${doneSoFar + 1} de ${totalKnownNow}`;
}
function finishLesson() {
  progress.unitsCompleted[session.lesson.id] = true;
  saveProgress();
  const pctFirstTry = session.total ? Math.round((session.firstTryCorrect / session.total) * 100) : 0;
  document.getElementById("sumScore").textContent = session.lastLessonScore;
  document.getElementById("sumAccuracy").textContent = pctFirstTry + "%";
  document.getElementById("sumReview").textContent = session.reviewedCount;
  showView("summary");
}

// ---------------------------------------------------------------------------
// Answer checking
// ---------------------------------------------------------------------------
function normalizeAnswer(s) {
  if (s === null || s === undefined) return "";
  const cleaned = cleanForDisplay(s.toString());
  return cleaned.toLowerCase().replace(/\s+/g, " ").replace(/[.,!?;:]+$/g, "").trim();
}
function answersMatch(given, correct) {
  const g = normalizeAnswer(given), c = normalizeAnswer(correct);
  return g === c && g.length > 0;
}
function grade(isCorrect) {
  const banner = document.getElementById("feedbackBanner");
  banner.classList.remove("hidden", "correct", "incorrect");
  session.checked = true;
  document.getElementById("btnCheck").classList.add("hidden");
  document.getElementById("btnContinue").classList.remove("hidden");
  document.getElementById("btnContinue").focus();

  const firstAttempt = session.current.attempts === 0;
  session.current.attempts++;

  if (isCorrect) {
    banner.classList.add("correct");
    banner.innerHTML = `<span>✓ Correto!</span>`;
    progress.energy = Math.min(100, progress.energy + 4);
    if (firstAttempt) { progress.score += 10; session.firstTryCorrect++; session.lastLessonScore += 10; }
    else { progress.score += 5; session.reviewedCount++; session.lastLessonScore += 5; }
    session.completedCount++;
  } else {
    banner.classList.add("incorrect");
    let explain = "";
    if (session.current.ex.correctAnswer) {
      explain = `<div class="explain">Resposta esperada: <strong>${escapeHtml(cleanForDisplay(session.current.ex.correctAnswer))}</strong></div>`;
    }
    banner.innerHTML = `<span>✗ Não foi dessa vez.</span>${explain}`;
    progress.energy = Math.max(10, progress.energy - 6);
    session.queue.push(session.current);
  }
  updateHeaderStats();
  saveProgress();
}
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// ---------------------------------------------------------------------------
// OCR artifact cleanup (cosmetic + comparison-safe)
// ---------------------------------------------------------------------------
// Some sentences carry leftover OCR noise from the book's checkbox/bullet
// glyphs: a trailing stray digit or "|"/"[]" right after the sentence, or a
// short garbled token before the sentence's real capitalized start (e.g.
// "a 1 My dad watchs TV..." or "Xd J Steve usually..."). These helpers strip
// that noise for display and for answer comparison, without touching the
// sentence's actual wording.
function cleanTrailingArtifacts(s) {
  if (!s) return s;
  let out = s;
  for (let i = 0; i < 2; i++) {
    out = out.replace(/\s+[|[\]]{1,2}\s*$/, "");
    out = out.replace(/\s+\d\s*$/, "");
  }
  return out.trim();
}
const COMMON_LEAD_WORDS = new Set([
  "i","a","an","is","am","are","we","he","it","do","to","of","in","on","at","my",
  "up","no","if","so","us","or","the","and","but","you","she","they","this","that",
  "was","were","has","have","had","will","would","can","could","should","must","not","did"
]);
function cleanLeadingArtifacts(s) {
  if (!s) return s;
  const m = s.match(/^((?:[A-Za-z0-9]{1,3}\.?\s+){1,2})(?=[A-Z][a-z])/);
  if (!m) return s;
  const tokens = m[1].trim().split(/\s+/).map(t => t.replace(/\.$/, "").toLowerCase());
  const looksLikeRealWords = tokens.some(t => COMMON_LEAD_WORDS.has(t));
  if (looksLikeRealWords) return s; // don't risk stripping a legitimate short word
  return s.slice(m[1].length);
}
function cleanForDisplay(s) {
  // NOTE: only trailing-artifact cleanup is applied broadly (safe/deterministic).
  // Leading-artifact cleanup is deliberately NOT applied here: it risks
  // stripping real short words ("a", "an", "I") that happen to precede a
  // capitalized word, which would silently corrupt otherwise-correct
  // sentences. It's only used in the isolated 2-option review-card display
  // (see renderReviewCard), where it's purely cosmetic and never affects
  // grading.
  return cleanTrailingArtifacts((s || "").toString());
}

// ---------------------------------------------------------------------------
// Text-to-speech
// ---------------------------------------------------------------------------
function speak(text) {
  if (!("speechSynthesis" in window)) { toast("Síntese de voz não disponível neste navegador."); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ---------------------------------------------------------------------------
// Exercise renderers
// ---------------------------------------------------------------------------

// BUGFIX: some "REWRITE THE SENTENCES, PUTTING THE WORDS IN THE CORRECT ORDER"
// exercises were mis-tagged as type "transform" during the PDF extraction,
// because the stored instruction text was truncated right before the word
// "ORDER" (the classifier never saw it). These items are still recognizable
// at render time because their raw content preserves the original "||"
// separated word fragments from the book. We detect that pattern here and
// route them to the word-tile UI instead of a free-text box, regardless of
// what the "type" field says.
function looksLikeWordTiles(content) {
  return typeof content === "string" && /\|\|/.test(content);
}
function deriveTilesFromContent(content) {
  return content
    .split(/\|\|+/)
    .map(t => t.replace(/[\[\]{}()"']/g, "").replace(/\s+/g, " ").trim())
    .filter(t => t.length > 0 && /[A-Za-z]/.test(t));
}

function renderExercise(ex) {
  const stage = document.getElementById("exerciseStage");
  document.getElementById("btnCheck").disabled = true;
  stage.innerHTML = "";

  const head = document.createElement("div");
  head.innerHTML = `
    <div class="ex-instruction">${escapeHtml(ex.instruction || "")}</div>
    <div class="ex-meta">Unidade ${ex.unit} · Exercício ${ex.originalNumber} · pág. ${ex.sourcePage}${ex.needsReview ? " · <strong>revisão sugerida</strong>" : ""}</div>
  `;
  stage.appendChild(head);

  if (ex.manualReview) { renderReviewCard(stage, ex); return; }

  if (ex.type !== "reorder-words" && looksLikeWordTiles(ex.content) && ex.correctAnswer) {
    renderReorder(stage, ex);
    return;
  }

  switch (ex.type) {
    case "fill-blank": renderFillBlank(stage, ex); break;
    case "multiple-choice": renderMultipleChoice(stage, ex); break;
    case "reorder-words": renderReorder(stage, ex); break;
    case "correction":
    case "rewrite":
    case "transform": renderTextAnswer(stage, ex); break;
    case "matching": renderMatching(stage, ex); break;
    default: renderReviewCard(stage, ex);
  }
}

function renderReviewCard(stage, ex) {
  const div = document.createElement("div");
  div.className = "review-card";
  let bodyHtml;
  if (ex.type === "multiple-choice" && Array.isArray(ex.options) && ex.options.length === 2) {
    // Show the two candidate sentences as separate, readable lines instead
    // of the raw "optionA  /  optionB" joined string.
    const optA = cleanLeadingArtifacts(cleanForDisplay(ex.options[0]));
    const optB = cleanLeadingArtifacts(cleanForDisplay(ex.options[1]));
    bodyHtml = `
      <p>Não foi possível confirmar com segurança qual alternativa é a correta. Compare com a página original antes de decidir:</p>
      <div class="raw">A) ${escapeHtml(optA)}\nB) ${escapeHtml(optB)}</div>
    `;
  } else {
    bodyHtml = `
      <p>Este item não pôde ser convertido automaticamente com segurança (ex.: depende de imagem, ou o texto reconhecido do livro ficou ambíguo). Confira a página original antes de estudar este item.</p>
      <div class="raw">${escapeHtml(cleanForDisplay(ex.content) || "(sem conteúdo bruto disponível)")}</div>
    `;
  }
  div.innerHTML = `<span class="flag">Revisão necessária</span>` + bodyHtml;
  stage.appendChild(div);
  const actions = document.createElement("div");
  actions.className = "review-actions";
  actions.innerHTML = `<button class="btn-secondary" id="btnMarkReviewed">Já conferi — marcar como concluído</button>`;
  stage.appendChild(actions);
  document.getElementById("btnMarkReviewed").addEventListener("click", () => grade(true));
  document.getElementById("btnCheck").classList.add("hidden");
}

function renderFillBlank(stage, ex) {
  const parts = (ex.content || "").split("___");
  if (parts.length <= 1) {
    // BUGFIX: content has no "___" marker (common when the blank was empty
    // space in the book and OCR captured nothing there). Previously this
    // rendered the sentence once with no input, detected the missing input,
    // and then called renderTextAnswer() as a "fallback" — which rendered
    // the SAME sentence a second time, this time with the input box. That
    // caused the visible duplicate-text bug. Route straight to the
    // single-render free-text UI instead.
    renderTextAnswer(stage, ex);
    return;
  }
  const wrap = document.createElement("div");
  const html = `<div class="ex-prompt">` +
    escapeHtml(cleanForDisplay(parts[0])) +
    `<input type="text" class="blank-input" id="answerInput" aria-label="Resposta" autocomplete="off">` +
    escapeHtml(cleanForDisplay(parts.slice(1).join("___"))) +
    `</div>`;
  stage._blankParts = parts;
  wrap.innerHTML = html;
  stage.appendChild(wrap);

  const input = document.getElementById("answerInput");
  input.addEventListener("input", () => { document.getElementById("btnCheck").disabled = input.value.trim().length === 0; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !document.getElementById("btnCheck").disabled) doCheck(); });
  setTimeout(() => input.focus(), 50);
}

function renderTextAnswer(stage, ex) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="ex-prompt">${escapeHtml(cleanForDisplay(ex.content || ""))}</div>
    <input type="text" class="text-answer-input" id="answerInput" aria-label="Digite sua resposta" autocomplete="off" placeholder="Digite a frase...">
  `;
  stage.appendChild(wrap);
  const input = document.getElementById("answerInput");
  input.addEventListener("input", () => { document.getElementById("btnCheck").disabled = input.value.trim().length === 0; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !document.getElementById("btnCheck").disabled) doCheck(); });
  setTimeout(() => input.focus(), 50);
}

function renderMultipleChoice(stage, ex) {
  const wrap = document.createElement("div");
  wrap.innerHTML = `<div class="ex-prompt">${escapeHtml(cleanForDisplay(ex.content || ""))}</div>`;
  const list = document.createElement("div");
  list.className = "choice-list";
  list.setAttribute("role", "radiogroup");
  const rawOpts = ex.options && ex.options.length ? ex.options : ["Correto", "Incorreto"];
  rawOpts.forEach((rawOpt) => {
    const opt = cleanForDisplay(rawOpt);
    const item = document.createElement("button");
    item.className = "choice-item";
    item.setAttribute("role", "radio");
    item.setAttribute("aria-checked", "false");
    item.textContent = opt;
    item.addEventListener("click", () => {
      list.querySelectorAll(".choice-item").forEach(c => { c.classList.remove("selected"); c.setAttribute("aria-checked", "false"); });
      item.classList.add("selected");
      item.setAttribute("aria-checked", "true");
      list.dataset.selected = opt;
      document.getElementById("btnCheck").disabled = false;
    });
    list.appendChild(item);
  });
  wrap.appendChild(list);
  stage.appendChild(wrap);
}

function renderReorder(stage, ex) {
  let words;
  if (ex.options && ex.options.length) {
    words = [...ex.options];
  } else if (looksLikeWordTiles(ex.content)) {
    words = deriveTilesFromContent(ex.content);
  } else {
    words = (ex.content || "").split(/\s+/).filter(Boolean);
  }
  shuffle(words);
  const wrap = document.createElement("div");
  wrap.innerHTML = `<p class="ex-hint">Toque nas palavras na ordem correta para formar a frase.</p>`;
  const answerZone = document.createElement("div");
  answerZone.className = "tile-answer";
  const bank = document.createElement("div");
  bank.className = "tile-bank";
  wrap.appendChild(answerZone);
  wrap.appendChild(bank);
  stage.appendChild(wrap);

  const placed = [];
  words.forEach((w, idx) => {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.textContent = w;
    tile.dataset.idx = idx;
    tile.addEventListener("click", () => {
      if (tile.classList.contains("used")) return;
      tile.classList.add("used");
      placed.push({ text: w, idx });
      renderPlaced();
    });
    bank.appendChild(tile);
  });

  function renderPlaced() {
    answerZone.innerHTML = "";
    placed.forEach((p, i) => {
      const t = document.createElement("button");
      t.className = "tile placed";
      t.textContent = p.text;
      t.addEventListener("click", () => {
        placed.splice(i, 1);
        bank.querySelector(`[data-idx="${p.idx}"]`).classList.remove("used");
        renderPlaced();
      });
      answerZone.appendChild(t);
    });
    document.getElementById("btnCheck").disabled = placed.length === 0;
  }
  stage._getReorderAnswer = () => placed.map(p => p.text).join(" ");
}

function renderMatching(stage, ex) {
  const pairs = ex.options && ex.options.length ? ex.options : [];
  if (!pairs.length) { renderReviewCard(stage, ex); return; }
  const left = pairs.map(p => p.left || p[0]);
  const right = shuffle(pairs.map(p => p.right || p[1]).slice());

  const wrap = document.createElement("div");
  wrap.innerHTML = `<p class="ex-hint">Toque em um item da esquerda e depois no correspondente da direita.</p>`;
  const cols = document.createElement("div");
  cols.className = "match-columns";
  const colL = document.createElement("div"); colL.className = "match-col";
  const colR = document.createElement("div"); colR.className = "match-col";
  cols.appendChild(colL); cols.appendChild(colR);
  wrap.appendChild(cols);
  stage.appendChild(wrap);

  let selectedLeft = null;
  const userPairs = {};

  left.forEach((txt, i) => {
    const item = document.createElement("button");
    item.className = "match-item";
    item.textContent = txt;
    item.dataset.i = i;
    item.addEventListener("click", () => {
      if (item.classList.contains("paired")) return;
      colL.querySelectorAll(".match-item").forEach(x => x.classList.remove("selected"));
      item.classList.add("selected");
      selectedLeft = i;
    });
    colL.appendChild(item);
  });
  right.forEach((txt) => {
    const item = document.createElement("button");
    item.className = "match-item";
    item.textContent = txt;
    item.addEventListener("click", () => {
      if (item.classList.contains("paired") || selectedLeft === null) return;
      const leftItem = colL.querySelector(`[data-i="${selectedLeft}"]`);
      leftItem.classList.remove("selected"); leftItem.classList.add("paired");
      item.classList.add("paired");
      userPairs[selectedLeft] = txt;
      selectedLeft = null;
      document.getElementById("btnCheck").disabled = Object.keys(userPairs).length < left.length;
    });
    colR.appendChild(item);
  });

  stage._getMatchAnswer = () => userPairs;
  stage._matchPairs = pairs;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Check button
// ---------------------------------------------------------------------------
function doCheck() {
  if (session.checked) return;
  const ex = session.current.ex;
  const stage = document.getElementById("exerciseStage");
  let isCorrect = false;

  if (stage._getReorderAnswer) {
    const given = stage._getReorderAnswer();
    isCorrect = answersMatch(given, ex.correctAnswer || "");
  } else if (ex.type === "fill-blank" || ex.type === "correction" || ex.type === "rewrite" || ex.type === "transform") {
    const input = document.getElementById("answerInput");
    const given = input ? input.value : "";
    let toCompare = given;
    if (ex.type === "fill-blank" && stage._blankParts && stage._blankParts.length > 1) {
      toCompare = (stage._blankParts[0] + given + stage._blankParts.slice(1).join("___")).trim();
    }
    isCorrect = answersMatch(toCompare, ex.correctAnswer || "");
    if (input) input.classList.add(isCorrect ? "correct" : "incorrect");
  } else if (ex.type === "multiple-choice") {
    const list = stage.querySelector(".choice-list");
    const given = list ? list.dataset.selected : "";
    isCorrect = answersMatch(given, ex.correctAnswer || "");
    list.querySelectorAll(".choice-item").forEach(item => {
      if (answersMatch(item.textContent, ex.correctAnswer || "")) item.classList.add("correct");
      else if (item.classList.contains("selected") && !isCorrect) item.classList.add("incorrect");
    });
  } else if (ex.type === "reorder-words") {
    const given = stage._getReorderAnswer ? stage._getReorderAnswer() : "";
    isCorrect = answersMatch(given, ex.correctAnswer || "");
  } else if (ex.type === "matching") {
    const given = stage._getMatchAnswer ? stage._getMatchAnswer() : {};
    const pairs = stage._matchPairs || [];
    isCorrect = pairs.every((p, i) => normalizeAnswer(given[i]) === normalizeAnswer(p.right || p[1]));
  }
  grade(isCorrect);
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------
document.getElementById("btnCheck").addEventListener("click", doCheck);
document.getElementById("btnContinue").addEventListener("click", nextExercise);
document.getElementById("btnHome").addEventListener("click", () => { renderHome(); showView("home"); });
document.getElementById("btnBackToHome").addEventListener("click", () => { renderHome(); showView("home"); });
document.getElementById("btnExitLesson").addEventListener("click", () => {
  if (confirm("Sair da lição? Seu progresso nesta sessão será perdido.")) { renderHome(); showView("home"); }
});
document.getElementById("btnBackToUnits").addEventListener("click", () => {
  openChapter(CONTENT.chapters.indexOf(session.chapter));
});
document.getElementById("btnRedoLesson").addEventListener("click", () => { startLesson(session.chapter, session.lesson); });
document.getElementById("btnTheme").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  const next = cur === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("trilha_theme", next);
});
document.getElementById("btnResetProgress").addEventListener("click", () => {
  if (confirm("Isso vai apagar toda a pontuação e progresso salvos (localmente e na nuvem). Continuar?")) {
    progress = { score: 0, energy: 100, unitsCompleted: {}, lastUnit: null };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    if (typeof pushRemoteProgress === "function") pushRemoteProgress(progress);
    updateHeaderStats();
    renderHome();
    showView("home");
    toast("Progresso apagado.");
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !document.getElementById("btnContinue").classList.contains("hidden")) {
    document.getElementById("btnContinue").click();
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
bootApp();

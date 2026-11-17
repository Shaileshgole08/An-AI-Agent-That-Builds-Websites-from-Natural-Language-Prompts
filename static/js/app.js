/* ===================================================================
   WebCraft AI — Frontend Application Logic
   =================================================================== */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  phase: 'idle',          // idle | clarifying | generating | done
  originalPrompt: '',
  questions: [],
  generatedHTML: '',
};

// ── DOM refs ───────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const chatWindow      = $('chatWindow');
const questionsPanel  = $('questionsPanel');
const questionsList   = $('questionsList');
const questionsForm   = $('questionsForm');
const inputArea       = $('inputArea');
const promptInput     = $('promptInput');
const sendBtn         = $('sendBtn');
const loadingOverlay  = $('loadingOverlay');
const loadingText     = $('loadingText');
const loadingSub      = $('loadingSub');
const previewFrame    = $('previewFrame');
const codeContent     = $('codeContent');
const previewLabel    = $('previewLabel');
const toast           = $('toast');
const welcomeCard     = $('welcomeCard');


// ── Sidebar toggle ─────────────────────────────────────────────────────────
document.getElementById('sidebarToggle').addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
});


// ── Auto-resize textarea ───────────────────────────────────────────────────
promptInput.addEventListener('input', () => {
  promptInput.style.height = 'auto';
  promptInput.style.height = Math.min(promptInput.scrollHeight, 160) + 'px';
});

promptInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});


// ── Panel switching ────────────────────────────────────────────────────────
function showPanel(name) {
  ['chat', 'preview', 'code'].forEach(p => {
    document.getElementById('panel' + p.charAt(0).toUpperCase() + p.slice(1))
            .classList.toggle('hidden', p !== name);
    document.getElementById('btn' + p.charAt(0).toUpperCase() + p.slice(1))
            .classList.toggle('active', p !== name ? false : true);
  });
}


// ── Fill prompt from example chip ─────────────────────────────────────────
function fillPrompt(text) {
  promptInput.value = text;
  promptInput.focus();
  promptInput.style.height = 'auto';
  promptInput.style.height = Math.min(promptInput.scrollHeight, 160) + 'px';
}


// ── Add chat message ───────────────────────────────────────────────────────
function addMessage(role, content) {
  // Always look up the welcome card dynamically — it may be recreated by resetAll()
  const wc = document.getElementById('welcomeCard');
  if (wc) wc.remove();

  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'user' ? '👤' : '🤖';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = content.replace(/\n/g, '<br>');

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  chatWindow.appendChild(wrap);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}


// ── Main send handler ──────────────────────────────────────────────────────
async function handleSend() {
  const text = promptInput.value.trim();
  if (!text || state.phase !== 'idle') return;

  state.originalPrompt = text;
  promptInput.value = '';
  promptInput.style.height = 'auto';
  sendBtn.disabled = true;

  addMessage('user', text);
  inputArea.style.display = 'none';

  await fetchClarifyingQuestions(text);
}


// ── Step 1: Fetch clarifying questions ────────────────────────────────────
async function fetchClarifyingQuestions(prompt) {
  state.phase = 'clarifying';
  showLoading('Analyzing your idea…', 'The AI is thinking about what to ask you');

  try {
    const res = await fetch('/api/clarify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');

    hideLoading();
    state.questions = data.questions;
    renderQuestions(data.questions);

    addMessage('assistant',
      '✨ Great idea! I have a few questions to make sure I build exactly what you need. '
      + 'Please fill out the form below — the more detail the better!');

  } catch (err) {
    hideLoading();
    state.phase = 'idle';
    inputArea.style.display = '';
    sendBtn.disabled = false;
    addMessage('assistant', `❌ Something went wrong: ${err.message}`);
    showToast('Error: ' + err.message, 'error');
  }
}


// ── Render questions form ──────────────────────────────────────────────────
function renderQuestions(questions) {
  questionsList.innerHTML = '';

  questions.forEach((q, i) => {
    const item = document.createElement('div');
    item.className = 'question-item';
    item.innerHTML = `
      <label for="q${i}">
        <strong>Q${i + 1}.</strong> ${escapeHTML(q)}
      </label>
      <textarea id="q${i}" name="q${i}" rows="2" placeholder="Your answer…"></textarea>
    `;
    questionsList.appendChild(item);
  });

  questionsPanel.style.display = 'block';
  questionsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// ── Questions form submit → Step 2: Generate ──────────────────────────────
questionsForm.addEventListener('submit', async e => {
  e.preventDefault();

  const answers = state.questions.map((q, i) => {
    const val = (document.getElementById(`q${i}`)?.value || '').trim();
    return `Q${i + 1}: ${q}\nA: ${val || '(no answer)'}`;
  }).join('\n\n');

  questionsPanel.style.display = 'none';

  // Show answers summary in chat
  const summary = state.questions.map((q, i) => {
    const val = (document.getElementById(`q${i}`)?.value || '').trim();
    return `**${q}**\n→ ${val || '(skipped)'}`;
  }).join('\n\n');

  addMessage('user', summary.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'));

  await generateWebsite(answers);
});


// ── Step 2: Generate website ───────────────────────────────────────────────
async function generateWebsite(answers) {
  state.phase = 'generating';

  const messages = [
    'Crafting your website…',
    'Designing the layout…',
    'Writing the HTML…',
    'Styling with CSS…',
    'Adding interactivity…',
    'Polishing the design…',
  ];
  let msgIdx = 0;
  showLoading(messages[0], 'This usually takes 15–30 seconds');

  const ticker = setInterval(() => {
    msgIdx = (msgIdx + 1) % messages.length;
    loadingText.textContent = messages[msgIdx];
  }, 3500);

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: state.originalPrompt,
        answers,
      }),
    });

    clearInterval(ticker);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Server error');

    hideLoading();
    state.generatedHTML = data.html;
    state.phase = 'done';

    addMessage('assistant',
      '🎉 Your website is ready! Switch to the <strong>Preview</strong> or <strong>Code</strong> tab to see it. '
      + 'You can download the HTML file anytime.');

    // Populate preview and code
    renderPreview(data.html);
    renderCode(data.html);

    // Enable nav buttons
    $('btnPreview').disabled = false;
    $('btnCode').disabled = false;

    // Auto-switch to preview
    showPanel('preview');
    previewLabel.textContent = state.originalPrompt.slice(0, 60) + (state.originalPrompt.length > 60 ? '…' : '');

    showToast('Website generated successfully! 🎉', 'success');

  } catch (err) {
    clearInterval(ticker);
    hideLoading();
    state.phase = 'idle';
    inputArea.style.display = '';
    sendBtn.disabled = false;
    addMessage('assistant', `❌ Generation failed: ${err.message}`);
    showToast('Error: ' + err.message, 'error');
  }
}


// ── Render iframe preview ──────────────────────────────────────────────────
function renderPreview(html) {
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  previewFrame.src = url;
}


// ── Render code view ───────────────────────────────────────────────────────
function renderCode(html) {
  codeContent.textContent = html;
}


// ── Download ───────────────────────────────────────────────────────────────
function downloadWebsite() {
  if (!state.generatedHTML) { showToast('No website generated yet', 'error'); return; }
  const blob = new Blob([state.generatedHTML], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'website.html';
  a.click();
  showToast('Downloaded!', 'success');
}


// ── Open fullscreen ────────────────────────────────────────────────────────
function openFullscreen() {
  if (!state.generatedHTML) return;
  const win = window.open('', '_blank');
  win.document.write(state.generatedHTML);
  win.document.close();
}


// ── Copy code ──────────────────────────────────────────────────────────────
async function copyCode() {
  if (!state.generatedHTML) { showToast('No code yet', 'error'); return; }
  try {
    await navigator.clipboard.writeText(state.generatedHTML);
    showToast('Code copied to clipboard!', 'success');
  } catch {
    showToast('Copy failed — try manually selecting the code', 'error');
  }
}


// ── Reset ──────────────────────────────────────────────────────────────────
function resetAll() {
  state.phase = 'idle';
  state.originalPrompt = '';
  state.questions = [];
  state.generatedHTML = '';

  // Clear chat
  chatWindow.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'welcome-card';
  card.id = 'welcomeCard';
  card.innerHTML = `
    <div class="welcome-icon">🚀</div>
    <h2>What website do you want to build?</h2>
    <p>Type your idea below — a portfolio, landing page, restaurant site, SaaS homepage, or anything else.</p>
    <div class="example-chips">
      <button class="chip" onclick="fillPrompt('A portfolio website for a graphic designer')">Portfolio site</button>
      <button class="chip" onclick="fillPrompt('A landing page for a fitness app')">Fitness app landing</button>
      <button class="chip" onclick="fillPrompt('A restaurant website with menu and reservations')">Restaurant site</button>
      <button class="chip" onclick="fillPrompt('A SaaS product homepage for a project management tool')">SaaS homepage</button>
    </div>`;
  chatWindow.appendChild(card);

  questionsPanel.style.display = 'none';
  questionsList.innerHTML = '';
  inputArea.style.display = '';
  promptInput.value = '';
  promptInput.style.height = 'auto';
  sendBtn.disabled = false;

  $('btnPreview').disabled = true;
  $('btnCode').disabled = true;
  previewFrame.src = '';
  codeContent.textContent = '';

  showPanel('chat');
}


// ── Loading helpers ────────────────────────────────────────────────────────
function showLoading(text, sub = '') {
  loadingText.textContent = text;
  loadingSub.textContent  = sub;
  loadingOverlay.style.display = 'flex';
}
function hideLoading() {
  loadingOverlay.style.display = 'none';
}


// ── Toast helper ───────────────────────────────────────────────────────────
let toastTimer;
function showToast(message, type = '') {
  toast.textContent = message;
  toast.className = 'toast' + (type ? ' ' + type : '');
  void toast.offsetWidth; // reflow
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}


// ── Utility ────────────────────────────────────────────────────────────────
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

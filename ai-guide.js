'use strict';

const backend = 'http://localhost:3000';
const sceneSelect = document.getElementById('scene');
const modelSelect = document.getElementById('model');
const title = document.getElementById('conversation-title');
const scenePhoto = document.getElementById('scene-photo');
const connection = document.getElementById('connection');
const connectionText = document.getElementById('connection-text');
const checkButton = document.getElementById('check-button');
const messages = document.getElementById('messages');
const clearButton = document.getElementById('clear-button');
const questionForm = document.getElementById('question-form');
const questionInput = document.getElementById('question');
const sendButton = document.getElementById('send-button');
const feedback = document.getElementById('feedback');
const quickButtons = document.querySelectorAll('[data-question]');

const scenes = window.APP_DATA?.scenes ?? [];
const warmup = '你好！可以問我這一景的觀察重點、景點背景，或拍照建議。';
const history = [];
let sending = false;

function showConnection(state, label) {
  connection.dataset.state = state;
  connectionText.textContent = label;
}

function showMode(mode) {
  if (mode === 'live') {
    showConnection('live', 'LIVE 已連線');
  } else if (mode === 'demo') {
    showConnection('demo', 'DEMO 離線測試');
  }
}

async function checkConnection() {
  if (checkButton.disabled) return;
  checkButton.disabled = true;
  showConnection('checking', '正在檢查後端');
  try {
    const response = await fetch(backend + '/health', {
      credentials: 'omit',
      signal: AbortSignal.timeout(8000)
    });
    const data = await response.json();
    if (!response.ok || data.status !== 'ready' || !['demo', 'live'].includes(data.mode)) {
      throw new Error('後端未就緒');
    }
    showMode(data.mode);
  } catch {
    showConnection('offline', '無法連到本機後端');
  } finally {
    checkButton.disabled = false;
  }
}

function showMessage(role, content, detail = '') {
  const item = document.createElement('div');
  item.className = 'message ' + role;

  const label = document.createElement('span');
  label.className = 'message-label';
  label.textContent = role === 'user' ? '你' : '導覽';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const text = document.createElement('p');
  text.textContent = content;
  bubble.append(text);

  if (detail) {
    const caption = document.createElement('small');
    caption.textContent = detail;
    bubble.append(caption);
  }

  item.append(label, bubble);
  messages.append(item);
  messages.scrollTop = messages.scrollHeight;
}

function clearConversation() {
  history.length = 0;
  messages.replaceChildren();
  feedback.textContent = '';
  questionInput.value = '';
  showMessage('assistant', warmup);
}

function readCurrentScene() {
  return scenes.find(scene => scene.id === sceneSelect.value);
}

function showScene() {
  const scene = readCurrentScene();
  title.textContent = scene?.name ?? '跨海大橋';
  scenePhoto.hidden = !scene;
  if (scene) {
    scenePhoto.src = 'tiles/' + encodeURIComponent(scene.id) + '/1/f/0/0.jpg';
  }
  clearConversation();
}

function lockForm(locked) {
  sending = locked;
  sendButton.disabled = locked;
  sendButton.textContent = locked ? '回答中…' : '送出 ↑';
  questionInput.readOnly = locked;
  sceneSelect.disabled = locked || !scenes.length;
  modelSelect.disabled = locked;
  clearButton.disabled = locked;
  quickButtons.forEach(button => { button.disabled = locked; });
}

function requestError(response, data) {
  if (response.status === 402) return '你們組的 AI 額度已用完。';
  if (data.code === 'context_too_long') return '對話太長。請清除對話後，改用較短的問題。';
  if (typeof data.error === 'string' && data.error.trim()) {
    return data.error + '（HTTP ' + response.status + '）';
  }
  return '後端回傳 HTTP ' + response.status + '，請到控制台查看即時請求紀錄。';
}

async function sendQuestion(event) {
  event.preventDefault();
  if (sending) return;

  const question = questionInput.value.trim();
  if (!question) {
    feedback.textContent = '請先輸入問題。';
    return;
  }

  const payload = { question, model: modelSelect.value };
  const scene = readCurrentScene();
  if (scene) payload.scene = Array.from(scene.name).slice(0, 100).join('');
  if (history.length) payload.history = history.slice();

  lockForm(true);
  feedback.textContent = '等待導覽助手回覆…';
  try {
    const response = await fetch(backend + '/chat', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000)
    });
    const data = await response.json().catch(() => ({})) ?? {};
    if (!response.ok) {
      feedback.textContent = requestError(response, data);
      return;
    }
    if (typeof data.answerText !== 'string' || !data.answerText.trim()) {
      feedback.textContent = '這次沒有收到可顯示的回覆。請到控制台查看即時請求紀錄。';
      return;
    }

    showMode(data.mode);
    showMessage('user', question);
    showMessage('assistant', data.answerText, [data.mode?.toUpperCase(), data.model].filter(Boolean).join(' · '));
    if (data.mode === 'live') {
      // Keep up to three recent exchanges. Short excerpts leave room for the course materials.
      history.push(
        { role: 'user', content: Array.from(question).slice(0, 300).join('').trim() },
        { role: 'assistant', content: Array.from(data.answerText.trim()).slice(0, 300).join('').trim() }
      );
      if (history.length > 6) history.splice(0, history.length - 6);
    }
    questionInput.value = '';
    feedback.textContent = '';
  } catch (error) {
    if (error.name === 'TimeoutError') {
      feedback.textContent = '等待回覆逾時。請先看控制台的「即時請求紀錄」。';
    } else {
      feedback.textContent = '連不到後端。請確認「啟動360後端.exe」仍開著，且這個網頁的網址已加入允許來源。';
    }
  } finally {
    lockForm(false);
  }
}

for (const scene of scenes) {
  sceneSelect.add(new Option(scene.name, scene.id));
}
const requestedScene = new URLSearchParams(location.search).get('scene');
if (scenes.some(scene => scene.id === requestedScene)) {
  sceneSelect.value = requestedScene;
}
sceneSelect.disabled = !scenes.length;
scenePhoto.addEventListener('error', () => { scenePhoto.hidden = true; });
scenePhoto.addEventListener('load', () => { scenePhoto.hidden = false; });
sceneSelect.addEventListener('change', showScene);
clearButton.addEventListener('click', clearConversation);
checkButton.addEventListener('click', checkConnection);
questionForm.addEventListener('submit', sendQuestion);
quickButtons.forEach(button => {
  button.addEventListener('click', () => {
    questionInput.value = button.dataset.question;
    questionInput.focus();
  });
});

showScene();
if (location.protocol === 'file:') {
  showConnection('offline', '請用 Live Server 開啟此頁');
  feedback.textContent = '在 VS Code 右鍵點 index.html，再選 Open with Live Server。';
  sendButton.disabled = true;
  checkButton.disabled = true;
} else {
  checkConnection();
}

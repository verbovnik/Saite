// Глобальні змінні
let mediaRecorder;
let audioChunks = [];
let recordingInterval;
let recordingStartTime;
let currentUser = null;

// API базова URL
const API_URL = '';

// Елементи DOM
const authModal = document.getElementById('authModal');
const authForm = document.getElementById('authForm');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');
const recordBtn = document.getElementById('recordBtn');
const recordText = document.getElementById('recordText');
const timer = document.getElementById('timer');
const audioPreview = document.getElementById('audioPreview');
const audioPlayer = document.getElementById('audioPlayer');
const publishBtn = document.getElementById('publishBtn');
const discardBtn = document.getElementById('discardBtn');
const postsContainer = document.getElementById('postsContainer');
const createPostSection = document.getElementById('createPostSection');

// Ініціалізація
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
});

// Перевірка авторизації
async function checkAuth() {
    try {
        const response = await fetch(`${API_URL}/api/auth/check`, {
            credentials: 'include'
        });
        const data = await response.json();

        if (data.authenticated) {
            currentUser = data.user;
            hideAuthModal();
            loadPosts();
        } else {
            showAuthModal();
        }
    } catch (error) {
        console.error('Помилка перевірки авторизації:', error);
        showAuthModal();
    }
}

// Показати/сховати модальне вікно авторизації
function showAuthModal() {
    authModal.classList.add('active');
    createPostSection.style.display = 'none';
}

function hideAuthModal() {
    authModal.classList.remove('active');
    createPostSection.style.display = 'block';
}

// Налаштування обробників подій
function setupEventListeners() {
    // Авторизація
    loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleAuth('login');
    });

    registerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleAuth('register');
    });

    logoutBtn.addEventListener('click', handleLogout);

    // Запис голосу
    recordBtn.addEventListener('click', toggleRecording);
    publishBtn.addEventListener('click', publishPost);
    discardBtn.addEventListener('click', discardRecording);
}

// Обробка авторизації
async function handleAuth(action) {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const ageConfirm = document.getElementById('ageConfirm').checked;

    if (!username || !password) {
        alert('Будь ласка, заповніть всі поля');
        return;
    }

    if (!ageConfirm) {
        alert('Необхідно підтвердити вік 18+');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/auth/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            hideAuthModal();
            loadPosts();
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
            document.getElementById('ageConfirm').checked = false;
        } else {
            alert(data.error || 'Помилка авторизації');
        }
    } catch (error) {
        console.error('Помилка авторизації:', error);
        alert('Помилка підключення до сервера');
    }
}

// Вихід
async function handleLogout() {
    try {
        await fetch(`${API_URL}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        currentUser = null;
        showAuthModal();
        postsContainer.innerHTML = '';
    } catch (error) {
        console.error('Помилка виходу:', error);
    }
}

// Запис голосу
async function toggleRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        await startRecording();
    } else {
        stopRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            audioPlayer.src = audioUrl;
            audioPreview.style.display = 'block';

            // Зберегти blob для відправки
            audioPlayer.audioBlob = audioBlob;
        };

        mediaRecorder.start();
        recordingStartTime = Date.now();

        recordBtn.classList.add('recording');
        recordText.textContent = 'Зупинити запис';

        // Таймер
        recordingInterval = setInterval(() => {
            const elapsed = Date.now() - recordingStartTime;
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            timer.textContent = `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;

            // Автоматична зупинка через 60 секунд
            if (seconds >= 60) {
                stopRecording();
            }
        }, 100);

    } catch (error) {
        console.error('Помилка доступу до мікрофона:', error);
        alert('Неможливо отримати доступ до мікрофона');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());

        clearInterval(recordingInterval);
        recordBtn.classList.remove('recording');
        recordText.textContent = 'Почати запис';

        const elapsed = Date.now() - recordingStartTime;
        const seconds = Math.floor(elapsed / 1000);

        if (seconds < 30) {
            alert('Мінімальна тривалість запису - 30 секунд');
            discardRecording();
        }
    }
}

function discardRecording() {
    audioPreview.style.display = 'none';
    audioPlayer.src = '';
    timer.textContent = '00:00';
    audioChunks = [];
}

// Публікація поста
async function publishPost() {
    if (!audioPlayer.audioBlob) {
        alert('Немає запису для публікації');
        return;
    }

    const formData = new FormData();
    formData.append('audio', audioPlayer.audioBlob, 'post.webm');

    try {
        const response = await fetch(`${API_URL}/api/posts`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (response.ok) {
            discardRecording();
            loadPosts();
            alert('Пост опубліковано!');
        } else {
            const data = await response.json();
            alert(data.error || 'Помилка публікації');
        }
    } catch (error) {
        console.error('Помилка публікації поста:', error);
        alert('Помилка підключення до сервера');
    }
}

// Завантаження постів
async function loadPosts() {
    try {
        const response = await fetch(`${API_URL}/api/posts`, {
            credentials: 'include'
        });
        const posts = await response.json();

        postsContainer.innerHTML = '';

        if (posts.length === 0) {
            postsContainer.innerHTML = '<p class="hint">Поки що немає постів. Будьте першим!</p>';
            return;
        }

        posts.forEach(post => {
            const postElement = createPostElement(post);
            postsContainer.appendChild(postElement);
        });
    } catch (error) {
        console.error('Помилка завантаження постів:', error);
        postsContainer.innerHTML = '<p class="error">Помилка завантаження постів</p>';
    }
}

// Створення елементу поста
function createPostElement(post) {
    const div = document.createElement('div');
    div.className = 'post';
    div.dataset.postId = post.id;

    const date = new Date(post.createdAt).toLocaleDateString('uk-UA', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
    });

    div.innerHTML = `
        <div class="post-header">
            <a href="/profile.html?user=${post.author.username}" class="post-author">
                ${post.author.username}
            </a>
            <span class="post-date">${date}</span>
        </div>
        <div class="post-audio">
            <audio controls>
                <source src="${post.audioUrl}" type="audio/webm">
            </audio>
        </div>
        <div class="post-stats">
            <span class="post-stat">🎧 ${post.listens} прослуховувань</span>
            <span class="post-stat">💬 ${post.commentsCount} коментарів</span>
            <span class="post-stat">🗳️ ${post.deleteVotes} голосів за видалення</span>
        </div>
        <div class="post-actions">
            <button class="btn-comment" onclick="showCommentRecorder('${post.id}')">
                Додати голосовий коментар
            </button>
            <button class="btn-vote-delete" onclick="voteDelete('${post.id}')">
                Проголосувати за видалення
            </button>
            <button class="btn-report" onclick="reportPost('${post.id}')">
                Поскаржитись
            </button>
        </div>
        <div class="comments-section" id="comments-${post.id}">
            <h4>Коментарі (${post.commentsCount})</h4>
            <div id="comment-recorder-${post.id}" style="display: none;">
                <div class="recorder">
                    <button class="btn-record" onclick="toggleCommentRecording('${post.id}')">
                        <span class="record-icon">⏺</span>
                        <span id="comment-record-text-${post.id}">Почати запис коментаря</span>
                    </button>
                    <div class="timer" id="comment-timer-${post.id}">00:00</div>
                </div>
                <div id="comment-preview-${post.id}" class="audio-preview" style="display: none;">
                    <audio id="comment-audio-${post.id}" controls></audio>
                    <div class="preview-actions">
                        <button class="btn-primary" onclick="publishComment('${post.id}')">Опублікувати</button>
                        <button class="btn-secondary" onclick="discardComment('${post.id}')">Скасувати</button>
                    </div>
                </div>
            </div>
            <div id="comments-list-${post.id}"></div>
        </div>
    `;

    // Завантажити коментарі
    loadComments(post.id);

    // Оновити лічильник прослуховувань
    const audio = div.querySelector('audio');
    audio.addEventListener('play', () => {
        incrementListens(post.id);
    }, { once: true });

    return div;
}

// Завантаження коментарів
async function loadComments(postId) {
    try {
        const response = await fetch(`${API_URL}/api/posts/${postId}/comments`, {
            credentials: 'include'
        });
        const comments = await response.json();

        const commentsListElement = document.getElementById(`comments-list-${postId}`);
        commentsListElement.innerHTML = '';

        comments.forEach(comment => {
            const commentElement = createCommentElement(comment, postId);
            commentsListElement.appendChild(commentElement);
        });
    } catch (error) {
        console.error('Помилка завантаження коментарів:', error);
    }
}

// Створення елементу коментаря
function createCommentElement(comment, postId) {
    const div = document.createElement('div');
    div.className = 'comment';
    if (comment.thumbsDown >= 5) {
        div.classList.add('hidden');
    }

    const date = new Date(comment.createdAt).toLocaleDateString('uk-UA', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });

    const isUserThumbedDown = comment.userThumbedDown || false;

    div.innerHTML = `
        <div class="comment-header">
            <span class="comment-author">${comment.author.username}</span>
            <span class="comment-date">${date}</span>
        </div>
        <div class="comment-audio">
            <audio controls>
                <source src="${comment.audioUrl}" type="audio/webm">
            </audio>
        </div>
        <div class="comment-actions">
            <button class="thumbs-down-btn ${isUserThumbedDown ? 'active' : ''}"
                    onclick="toggleThumbsDown('${comment.id}', '${postId}')">
                👎 ${comment.thumbsDown}
            </button>
        </div>
    `;

    return div;
}

// Показати рекордер коментарів
function showCommentRecorder(postId) {
    const recorder = document.getElementById(`comment-recorder-${postId}`);
    recorder.style.display = recorder.style.display === 'none' ? 'block' : 'none';
}

// Глобальні змінні для коментарів
const commentRecorders = {};

// Запис коментаря
async function toggleCommentRecording(postId) {
    if (!commentRecorders[postId] || commentRecorders[postId].state === 'inactive') {
        await startCommentRecording(postId);
    } else {
        stopCommentRecording(postId);
    }
}

async function startCommentRecording(postId) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        const chunks = [];

        recorder.ondataavailable = (event) => {
            chunks.push(event.data);
        };

        recorder.onstop = () => {
            const audioBlob = new Blob(chunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audioPlayer = document.getElementById(`comment-audio-${postId}`);
            audioPlayer.src = audioUrl;
            audioPlayer.audioBlob = audioBlob;
            document.getElementById(`comment-preview-${postId}`).style.display = 'block';
        };

        recorder.start();
        commentRecorders[postId] = { recorder, chunks, startTime: Date.now(), stream };

        const recordText = document.getElementById(`comment-record-text-${postId}`);
        recordText.textContent = 'Зупинити запис';

        // Таймер
        const timerInterval = setInterval(() => {
            if (!commentRecorders[postId]) {
                clearInterval(timerInterval);
                return;
            }

            const elapsed = Date.now() - commentRecorders[postId].startTime;
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            const timerElement = document.getElementById(`comment-timer-${postId}`);
            timerElement.textContent = `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;

            // Автоматична зупинка через 60 секунд
            if (seconds >= 60) {
                stopCommentRecording(postId);
                clearInterval(timerInterval);
            }
        }, 100);

        commentRecorders[postId].timerInterval = timerInterval;

    } catch (error) {
        console.error('Помилка доступу до мікрофона:', error);
        alert('Неможливо отримати доступ до мікрофона');
    }
}

function stopCommentRecording(postId) {
    const recorderData = commentRecorders[postId];
    if (recorderData && recorderData.recorder.state === 'recording') {
        recorderData.recorder.stop();
        recorderData.stream.getTracks().forEach(track => track.stop());
        clearInterval(recorderData.timerInterval);

        const recordText = document.getElementById(`comment-record-text-${postId}`);
        recordText.textContent = 'Почати запис коментаря';
    }
}

function discardComment(postId) {
    const preview = document.getElementById(`comment-preview-${postId}`);
    preview.style.display = 'none';
    const timer = document.getElementById(`comment-timer-${postId}`);
    timer.textContent = '00:00';
    delete commentRecorders[postId];
}

// Публікація коментаря
async function publishComment(postId) {
    const audioPlayer = document.getElementById(`comment-audio-${postId}`);
    if (!audioPlayer.audioBlob) {
        alert('Немає запису для публікації');
        return;
    }

    const formData = new FormData();
    formData.append('audio', audioPlayer.audioBlob, 'comment.webm');

    try {
        const response = await fetch(`${API_URL}/api/posts/${postId}/comments`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (response.ok) {
            discardComment(postId);
            loadComments(postId);
            loadPosts(); // Оновити статистику поста
        } else {
            const data = await response.json();
            alert(data.error || 'Помилка публікації коментаря');
        }
    } catch (error) {
        console.error('Помилка публікації коментаря:', error);
        alert('Помилка підключення до сервера');
    }
}

// Збільшити лічильник прослуховувань
async function incrementListens(postId) {
    try {
        await fetch(`${API_URL}/api/posts/${postId}/listen`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Помилка збільшення лічильника:', error);
    }
}

// Голосування за видалення
async function voteDelete(postId) {
    try {
        const response = await fetch(`${API_URL}/api/posts/${postId}/vote-delete`, {
            method: 'POST',
            credentials: 'include'
        });

        const data = await response.json();

        if (response.ok) {
            if (data.deleted) {
                alert('Пост було видалено спільнотою');
            } else {
                alert('Ваш голос враховано');
            }
            loadPosts();
        } else {
            alert(data.error || 'Помилка голосування');
        }
    } catch (error) {
        console.error('Помилка голосування:', error);
        alert('Помилка підключення до сервера');
    }
}

// Скарга на пост
async function reportPost(postId) {
    const reason = prompt('Причина скарги:');
    if (!reason) return;

    try {
        const response = await fetch(`${API_URL}/api/posts/${postId}/report`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });

        if (response.ok) {
            alert('Скаргу надіслано');
        } else {
            const data = await response.json();
            alert(data.error || 'Помилка відправки скарги');
        }
    } catch (error) {
        console.error('Помилка відправки скарги:', error);
        alert('Помилка підключення до сервера');
    }
}

// Додати/зняти мінус
async function toggleThumbsDown(commentId, postId) {
    try {
        const response = await fetch(`${API_URL}/api/comments/${commentId}/thumbs-down`, {
            method: 'POST',
            credentials: 'include'
        });

        if (response.ok) {
            loadComments(postId);
        } else {
            const data = await response.json();
            alert(data.error || 'Помилка');
        }
    } catch (error) {
        console.error('Помилка:', error);
        alert('Помилка підключення до сервера');
    }
}

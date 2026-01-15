// Глобальні змінні
let currentUser = null;
let profileUser = null;
let mediaRecorder;
let audioChunks = [];
let recordingInterval;
let recordingStartTime;

// API базова URL
const API_URL = '';

// Елементи DOM
const profileUsername = document.getElementById('profileUsername');
const listenersCount = document.getElementById('listenersCount');
const playsCount = document.getElementById('playsCount');
const commentsCount = document.getElementById('commentsCount');
const thumbsDownCount = document.getElementById('thumbsDownCount');
const userPosts = document.getElementById('userPosts');
const logoutBtn = document.getElementById('logoutBtn');

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
            loadProfile();
        } else {
            window.location.href = '/';
        }
    } catch (error) {
        console.error('Помилка перевірки авторизації:', error);
        window.location.href = '/';
    }
}

// Налаштування обробників подій
function setupEventListeners() {
    logoutBtn.addEventListener('click', handleLogout);
    document.getElementById('editProfileBtn').addEventListener('click', showEditModal);
    document.getElementById('addBioBtn').addEventListener('click', showBioRecorder);
    document.getElementById('uploadMusicBtn').addEventListener('click', () => {
        document.getElementById('musicInput').click();
    });
    document.getElementById('musicInput').addEventListener('change', handleMusicUpload);
    document.getElementById('removeMusicBtn').addEventListener('click', removeMusic);
    document.getElementById('recordBioBtn').addEventListener('click', toggleBioRecording);
    document.getElementById('saveBioBtn').addEventListener('click', saveBio);
    document.getElementById('cancelBioBtn').addEventListener('click', cancelBio);
    document.getElementById('editForm').addEventListener('submit', handleEditProfile);
    document.getElementById('cancelEditBtn').addEventListener('click', hideEditModal);
}

// Вихід
async function handleLogout() {
    try {
        await fetch(`${API_URL}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        window.location.href = '/';
    } catch (error) {
        console.error('Помилка виходу:', error);
    }
}

// Завантаження профілю
async function loadProfile() {
    const urlParams = new URLSearchParams(window.location.search);
    const username = urlParams.get('user') || currentUser.username;

    try {
        const response = await fetch(`${API_URL}/api/users/${username}`, {
            credentials: 'include'
        });

        if (!response.ok) {
            alert('Користувача не знайдено');
            window.location.href = '/';
            return;
        }

        profileUser = await response.json();

        // Оновити дані профілю
        profileUsername.textContent = profileUser.username;
        listenersCount.textContent = profileUser.listeners || 0;
        playsCount.textContent = profileUser.totalListens || 0;
        commentsCount.textContent = profileUser.totalComments || 0;
        thumbsDownCount.textContent = profileUser.totalThumbsDown || 0;

        // Завантажити голосове біо
        loadBio();

        // Завантажити музику
        loadMusic();

        // Завантажити пости користувача
        loadUserPosts();

        // Показати кнопки редагування тільки для власного профілю
        const isOwnProfile = currentUser.username === profileUser.username;
        document.getElementById('editProfileBtn').style.display = isOwnProfile ? 'inline-block' : 'none';
        document.getElementById('addBioBtn').style.display = isOwnProfile ? 'block' : 'none';
        document.querySelector('.profile-music-section').style.display = isOwnProfile ? 'block' : 'none';

    } catch (error) {
        console.error('Помилка завантаження профілю:', error);
        alert('Помилка завантаження профілю');
    }
}

// Завантаження голосового біо
async function loadBio() {
    const bioPlayer = document.getElementById('bioPlayer');
    const bioRecorder = document.getElementById('bioRecorder');
    const addBioBtn = document.getElementById('addBioBtn');

    if (profileUser.bioUrl) {
        document.getElementById('bioAudio').src = profileUser.bioUrl;
        bioPlayer.style.display = 'block';
        bioRecorder.style.display = 'none';
        addBioBtn.style.display = 'none';
    } else {
        bioPlayer.style.display = 'none';
        bioRecorder.style.display = 'none';
        const isOwnProfile = currentUser.username === profileUser.username;
        addBioBtn.style.display = isOwnProfile ? 'block' : 'none';
    }
}

// Показати рекордер біо
function showBioRecorder() {
    document.getElementById('bioRecorder').style.display = 'block';
    document.getElementById('addBioBtn').style.display = 'none';
}

// Запис голосового біо
async function toggleBioRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        await startBioRecording();
    } else {
        stopBioRecording();
    }
}

async function startBioRecording() {
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
            const audioPlayer = document.getElementById('bioPreviewAudio');
            audioPlayer.src = audioUrl;
            audioPlayer.audioBlob = audioBlob;
            document.getElementById('bioPreview').style.display = 'block';
        };

        mediaRecorder.start();
        recordingStartTime = Date.now();

        document.getElementById('recordBioText').textContent = 'Зупинити запис';

        // Таймер
        recordingInterval = setInterval(() => {
            const elapsed = Date.now() - recordingStartTime;
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            document.getElementById('bioTimer').textContent =
                `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;

            // Автоматична зупинка через 60 секунд
            if (seconds >= 60) {
                stopBioRecording();
            }
        }, 100);

    } catch (error) {
        console.error('Помилка доступу до мікрофона:', error);
        alert('Неможливо отримати доступ до мікрофона');
    }
}

function stopBioRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        clearInterval(recordingInterval);
        document.getElementById('recordBioText').textContent = 'Записати біо';
    }
}

function cancelBio() {
    document.getElementById('bioPreview').style.display = 'none';
    document.getElementById('bioTimer').textContent = '00:00';
    document.getElementById('bioRecorder').style.display = 'none';
    document.getElementById('addBioBtn').style.display = 'block';
    audioChunks = [];
}

// Збереження голосового біо
async function saveBio() {
    const audioPlayer = document.getElementById('bioPreviewAudio');
    if (!audioPlayer.audioBlob) {
        alert('Немає запису для збереження');
        return;
    }

    const formData = new FormData();
    formData.append('bio', audioPlayer.audioBlob, 'bio.webm');

    try {
        const response = await fetch(`${API_URL}/api/users/bio`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (response.ok) {
            alert('Біо збережено!');
            loadProfile();
        } else {
            const data = await response.json();
            alert(data.error || 'Помилка збереження біо');
        }
    } catch (error) {
        console.error('Помилка збереження біо:', error);
        alert('Помилка підключення до сервера');
    }
}

// Завантаження музики
async function loadMusic() {
    const musicPlayer = document.getElementById('musicPlayer');
    const musicUploader = document.getElementById('musicUploader');

    if (profileUser.musicUrl) {
        document.getElementById('profileMusic').src = profileUser.musicUrl;
        musicPlayer.style.display = 'block';
        musicUploader.style.display = 'none';

        // Автоматичне відтворення фонової музики
        const audio = document.getElementById('profileMusic');
        audio.volume = 0.3;
        audio.play().catch(e => console.log('Автоматичне відтворення заблоковано браузером'));
    } else {
        musicPlayer.style.display = 'none';
        const isOwnProfile = currentUser.username === profileUser.username;
        musicUploader.style.display = isOwnProfile ? 'block' : 'none';
    }
}

// Завантаження музики
async function handleMusicUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Перевірка типу файлу
    if (!file.type.startsWith('audio/')) {
        alert('Будь ласка, виберіть аудіо файл');
        return;
    }

    const formData = new FormData();
    formData.append('music', file);

    try {
        const response = await fetch(`${API_URL}/api/users/music`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (response.ok) {
            alert('Музику завантажено!');
            loadProfile();
        } else {
            const data = await response.json();
            alert(data.error || 'Помилка завантаження музики');
        }
    } catch (error) {
        console.error('Помилка завантаження музики:', error);
        alert('Помилка підключення до сервера');
    }
}

// Видалення музики
async function removeMusic() {
    if (!confirm('Видалити фонову музику?')) return;

    try {
        const response = await fetch(`${API_URL}/api/users/music`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            alert('Музику видалено');
            loadProfile();
        } else {
            const data = await response.json();
            alert(data.error || 'Помилка видалення музики');
        }
    } catch (error) {
        console.error('Помилка видалення музики:', error);
        alert('Помилка підключення до сервера');
    }
}

// Завантаження постів користувача
async function loadUserPosts() {
    try {
        const response = await fetch(`${API_URL}/api/users/${profileUser.username}/posts`, {
            credentials: 'include'
        });
        const posts = await response.json();

        userPosts.innerHTML = '';

        if (posts.length === 0) {
            userPosts.innerHTML = '<p class="hint">Поки що немає постів</p>';
            return;
        }

        posts.forEach(post => {
            const postElement = createPostElement(post);
            userPosts.appendChild(postElement);
        });
    } catch (error) {
        console.error('Помилка завантаження постів:', error);
        userPosts.innerHTML = '<p class="error">Помилка завантаження постів</p>';
    }
}

// Створення елементу поста
function createPostElement(post) {
    const div = document.createElement('div');
    div.className = 'post';

    const date = new Date(post.createdAt).toLocaleDateString('uk-UA', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
    });

    div.innerHTML = `
        <div class="post-header">
            <span class="post-author">${post.author.username}</span>
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
    `;

    return div;
}

// Модальне вікно редагування
function showEditModal() {
    document.getElementById('editModal').classList.add('active');
    document.getElementById('editUsername').value = currentUser.username;
}

function hideEditModal() {
    document.getElementById('editModal').classList.remove('active');
}

// Редагування профілю
async function handleEditProfile(event) {
    event.preventDefault();

    const newUsername = document.getElementById('editUsername').value.trim();
    if (!newUsername) {
        alert('Введіть нікнейм');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/users/profile`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username: newUsername })
        });

        if (response.ok) {
            alert('Профіль оновлено!');
            hideEditModal();
            window.location.reload();
        } else {
            const data = await response.json();
            alert(data.error || 'Помилка оновлення профілю');
        }
    } catch (error) {
        console.error('Помилка оновлення профілю:', error);
        alert('Помилка підключення до сервера');
    }
}

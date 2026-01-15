const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('docs'));
app.use('/uploads', express.static('uploads'));

// Session
app.use(session({
    secret: 'voice-network-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 днів
        httpOnly: true
    }
}));

// Налаштування multer для завантаження файлів
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath = 'uploads/';

        if (file.fieldname === 'audio') {
            uploadPath += 'posts/';
        } else if (file.fieldname === 'bio') {
            uploadPath += 'bio/';
        } else if (file.fieldname === 'music') {
            uploadPath += 'music/';
        }

        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});

// In-memory база даних (для production використовуйте реальну БД)
const db = {
    users: [],
    posts: [],
    comments: [],
    deleteVotes: new Map(),
    thumbsDown: new Map(),
    listeners: new Map(),
    reports: []
};

// Middleware для перевірки авторизації
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Необхідна авторизація' });
    }
    next();
}

// Допоміжні функції
function getUserById(userId) {
    return db.users.find(u => u.id === userId);
}

function getUserByUsername(username) {
    return db.users.find(u => u.username === username);
}

function getPostById(postId) {
    return db.posts.find(p => p.id === postId);
}

function getCommentById(commentId) {
    return db.comments.find(c => c.id === commentId);
}

// API Routes

// Перевірка авторизації
app.get('/api/auth/check', (req, res) => {
    if (req.session.userId) {
        const user = getUserById(req.session.userId);
        if (user) {
            return res.json({
                authenticated: true,
                user: {
                    id: user.id,
                    username: user.username
                }
            });
        }
    }
    res.json({ authenticated: false });
});

// Реєстрація
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Всі поля обов\'язкові' });
        }

        if (username.length < 3) {
            return res.status(400).json({ error: 'Нікнейм має бути не менше 3 символів' });
        }

        if (getUserByUsername(username)) {
            return res.status(400).json({ error: 'Користувач з таким нікнеймом вже існує' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = {
            id: uuidv4(),
            username,
            password: hashedPassword,
            createdAt: new Date().toISOString(),
            bioUrl: null,
            musicUrl: null
        };

        db.users.push(user);
        req.session.userId = user.id;

        res.json({
            user: {
                id: user.id,
                username: user.username
            }
        });
    } catch (error) {
        console.error('Помилка реєстрації:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Вхід
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Всі поля обов\'язкові' });
        }

        const user = getUserByUsername(username);
        if (!user) {
            return res.status(401).json({ error: 'Неправильний нікнейм або пароль' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Неправильний нікнейм або пароль' });
        }

        req.session.userId = user.id;

        res.json({
            user: {
                id: user.id,
                username: user.username
            }
        });
    } catch (error) {
        console.error('Помилка входу:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Вихід
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Створення поста
app.post('/api/posts', requireAuth, upload.single('audio'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Аудіо файл обов\'язковий' });
        }

        const user = getUserById(req.session.userId);
        const post = {
            id: uuidv4(),
            author: {
                id: user.id,
                username: user.username
            },
            audioUrl: `/uploads/posts/${req.file.filename}`,
            listens: 0,
            commentsCount: 0,
            deleteVotes: 0,
            createdAt: new Date().toISOString()
        };

        db.posts.unshift(post);
        res.json(post);
    } catch (error) {
        console.error('Помилка створення поста:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Отримання всіх постів
app.get('/api/posts', requireAuth, (req, res) => {
    try {
        const postsWithComments = db.posts.map(post => {
            const comments = db.comments.filter(c => c.postId === post.id);
            return {
                ...post,
                commentsCount: comments.length
            };
        });

        res.json(postsWithComments);
    } catch (error) {
        console.error('Помилка отримання постів:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Збільшення лічильника прослуховувань
app.post('/api/posts/:postId/listen', requireAuth, (req, res) => {
    try {
        const post = getPostById(req.params.postId);
        if (!post) {
            return res.status(404).json({ error: 'Пост не знайдено' });
        }

        const key = `${req.session.userId}-${post.id}`;
        if (!db.listeners.has(key)) {
            post.listens++;
            db.listeners.set(key, true);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Помилка збільшення лічильника:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Додавання коментаря
app.post('/api/posts/:postId/comments', requireAuth, upload.single('audio'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Аудіо файл обов\'язковий' });
        }

        const post = getPostById(req.params.postId);
        if (!post) {
            return res.status(404).json({ error: 'Пост не знайдено' });
        }

        // Перемістимо файл в папку коментарів
        const oldPath = req.file.path;
        const newPath = path.join('uploads/comments', req.file.filename);

        // Створимо папку якщо не існує
        if (!fs.existsSync('uploads/comments')) {
            fs.mkdirSync('uploads/comments', { recursive: true });
        }

        fs.renameSync(oldPath, newPath);

        const user = getUserById(req.session.userId);
        const comment = {
            id: uuidv4(),
            postId: post.id,
            author: {
                id: user.id,
                username: user.username
            },
            audioUrl: `/uploads/comments/${req.file.filename}`,
            thumbsDown: 0,
            createdAt: new Date().toISOString()
        };

        db.comments.push(comment);
        post.commentsCount++;

        res.json(comment);
    } catch (error) {
        console.error('Помилка додавання коментаря:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Отримання коментарів поста
app.get('/api/posts/:postId/comments', requireAuth, (req, res) => {
    try {
        const comments = db.comments
            .filter(c => c.postId === req.params.postId)
            .map(comment => {
                const key = `${req.session.userId}-${comment.id}`;
                return {
                    ...comment,
                    userThumbedDown: db.thumbsDown.has(key)
                };
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json(comments);
    } catch (error) {
        console.error('Помилка отримання коментарів:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Додати/зняти мінус коментарю
app.post('/api/comments/:commentId/thumbs-down', requireAuth, (req, res) => {
    try {
        const comment = getCommentById(req.params.commentId);
        if (!comment) {
            return res.status(404).json({ error: 'Коментар не знайдено' });
        }

        const key = `${req.session.userId}-${comment.id}`;

        if (db.thumbsDown.has(key)) {
            // Зняти мінус
            db.thumbsDown.delete(key);
            comment.thumbsDown = Math.max(0, comment.thumbsDown - 1);
        } else {
            // Додати мінус
            db.thumbsDown.set(key, true);
            comment.thumbsDown++;
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Помилка обробки мінусу:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Голосування за видалення поста
app.post('/api/posts/:postId/vote-delete', requireAuth, (req, res) => {
    try {
        const post = getPostById(req.params.postId);
        if (!post) {
            return res.status(404).json({ error: 'Пост не знайдено' });
        }

        const key = `${req.session.userId}-${post.id}`;

        if (db.deleteVotes.has(key)) {
            return res.status(400).json({ error: 'Ви вже проголосували' });
        }

        db.deleteVotes.set(key, true);
        post.deleteVotes++;

        // Перевірка на видалення
        // Умова: мінімум 5 голосів і більше 30% від кількості прослуховувань
        const shouldDelete = post.deleteVotes >= 5 &&
                           (post.listens > 0 && post.deleteVotes / post.listens > 0.3);

        if (shouldDelete) {
            // Видалити пост
            const index = db.posts.findIndex(p => p.id === post.id);
            if (index !== -1) {
                // Видалити файл
                const filePath = path.join(__dirname, post.audioUrl);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }

                // Видалити коментарі
                const postComments = db.comments.filter(c => c.postId === post.id);
                postComments.forEach(comment => {
                    const commentFilePath = path.join(__dirname, comment.audioUrl);
                    if (fs.existsSync(commentFilePath)) {
                        fs.unlinkSync(commentFilePath);
                    }
                });
                db.comments = db.comments.filter(c => c.postId !== post.id);

                db.posts.splice(index, 1);
                return res.json({ success: true, deleted: true });
            }
        }

        res.json({ success: true, deleted: false });
    } catch (error) {
        console.error('Помилка голосування:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Скарга на пост
app.post('/api/posts/:postId/report', requireAuth, (req, res) => {
    try {
        const post = getPostById(req.params.postId);
        if (!post) {
            return res.status(404).json({ error: 'Пост не знайдено' });
        }

        const user = getUserById(req.session.userId);
        const report = {
            id: uuidv4(),
            postId: post.id,
            reportedBy: user.username,
            reason: req.body.reason,
            createdAt: new Date().toISOString()
        };

        db.reports.push(report);
        res.json({ success: true });
    } catch (error) {
        console.error('Помилка відправки скарги:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Отримання профілю користувача
app.get('/api/users/:username', requireAuth, (req, res) => {
    try {
        const user = getUserByUsername(req.params.username);
        if (!user) {
            return res.status(404).json({ error: 'Користувача не знайдено' });
        }

        const userPosts = db.posts.filter(p => p.author.username === user.username);
        const totalListens = userPosts.reduce((sum, post) => sum + post.listens, 0);
        const totalComments = db.comments.filter(c => c.author.username === user.username).length;
        const userComments = db.comments.filter(c => c.author.username === user.username);
        const totalThumbsDown = userComments.reduce((sum, comment) => sum + comment.thumbsDown, 0);

        // Унікальні слухачі
        const listeners = new Set();
        db.listeners.forEach((value, key) => {
            const [userId, postId] = key.split('-');
            if (userPosts.find(p => p.id === postId)) {
                listeners.add(userId);
            }
        });

        res.json({
            id: user.id,
            username: user.username,
            bioUrl: user.bioUrl,
            musicUrl: user.musicUrl,
            listeners: listeners.size,
            totalListens,
            totalComments,
            totalThumbsDown,
            createdAt: user.createdAt
        });
    } catch (error) {
        console.error('Помилка отримання профілю:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Отримання постів користувача
app.get('/api/users/:username/posts', requireAuth, (req, res) => {
    try {
        const posts = db.posts
            .filter(p => p.author.username === req.params.username)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json(posts);
    } catch (error) {
        console.error('Помилка отримання постів:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Оновлення профілю
app.put('/api/users/profile', requireAuth, async (req, res) => {
    try {
        const user = getUserById(req.session.userId);
        const { username } = req.body;

        if (username && username !== user.username) {
            if (getUserByUsername(username)) {
                return res.status(400).json({ error: 'Цей нікнейм вже зайнятий' });
            }
            user.username = username;
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Помилка оновлення профілю:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Додавання голосового біо
app.post('/api/users/bio', requireAuth, upload.single('bio'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Аудіо файл обов\'язковий' });
        }

        const user = getUserById(req.session.userId);

        // Видалити старе біо якщо є
        if (user.bioUrl) {
            const oldPath = path.join(__dirname, user.bioUrl);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        user.bioUrl = `/uploads/bio/${req.file.filename}`;
        res.json({ success: true });
    } catch (error) {
        console.error('Помилка додавання біо:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Додавання музики
app.post('/api/users/music', requireAuth, upload.single('music'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Аудіо файл обов\'язковий' });
        }

        const user = getUserById(req.session.userId);

        // Видалити стару музику якщо є
        if (user.musicUrl) {
            const oldPath = path.join(__dirname, user.musicUrl);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        user.musicUrl = `/uploads/music/${req.file.filename}`;
        res.json({ success: true });
    } catch (error) {
        console.error('Помилка додавання музики:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Видалення музики
app.delete('/api/users/music', requireAuth, (req, res) => {
    try {
        const user = getUserById(req.session.userId);

        if (user.musicUrl) {
            const filePath = path.join(__dirname, user.musicUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            user.musicUrl = null;
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Помилка видалення музики:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🎙️  Voice Network сервер запущено на http://localhost:${PORT}`);
    console.log(`📁 Статичні файли: ./docs`);
    console.log(`📤 Завантаження: ./uploads`);
});

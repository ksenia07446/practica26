const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Настройка сервера
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Сессии
app.use(session({
    secret: 'bgitu-freelance-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
}));

// Раздаём статику
app.use(express.static('public'));

// ============================================
//  АВТОРИЗАЦИЯ
// ============================================

app.post('/api/auth/register', async (req, res) => {
    const { email, password, name, role, companyName, group } = req.body;

    if (!email || !password || !name || !role) {
        return res.status(400).json({ error: 'Все поля обязательны' });
    }

    try {
        const result = await db.registerUser(email, password, name, role, companyName, group);
        
        req.session.userId = result.userId;
        req.session.userRole = role;
        
        res.json({
            success: true,
            userId: result.userId,
            role: role,
            name: name,
            companyName: companyName || '',
            group: group || ''
        });
    } catch (error) {
        if (error.message.includes('существует')) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
        }
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Введите email и пароль' });
    }

    try {
        const user = await db.loginUser(email, password);
        
        req.session.userId = user.id;
        req.session.userRole = user.role;
        
        res.json({
            success: true,
            id: user.id,
            name: user.name,
            role: user.role,
            companyName: user.company_name || '',
            group: user.group || ''
        });
    } catch (error) {
        res.status(401).json({ error: error.message || 'Неверный email или пароль' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/auth/check', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    try {
        const user = await db.getUserById(req.session.userId);
        if (!user) {
            req.session.destroy();
            return res.status(401).json({ error: 'Пользователь не найден' });
        }

        res.json({
            id: user.id,
            name: user.name,
            role: user.role,
            companyName: user.company_name || '',
            group: user.group || ''
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============================================
//  ДАННЫЕ ПОЛЬЗОВАТЕЛЯ
// ============================================

app.get('/api/user-data', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    try {
        const userId = req.session.userId;
        const user = await db.getUserById(userId);
        
        const [tasks, activeTasks, completedTasks, likedStudents, staticLikes, staticResponds, companyCompleted] = await Promise.all([
            db.getUserTasks(userId),
            db.getStudentActiveTasks(userId),
            db.getStudentCompletedTasks(userId),
            db.getLikedStudents(userId),
            db.getStaticLikes(userId),
            db.getStaticResponds(userId),
            db.getCompanyCompletedTasks(userId)
        ]);

        res.json({
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                companyName: user.company_name || '',
                group: user.group || ''
            },
            tasks: tasks || [],
            activeTasks: activeTasks || [],
            completedTasks: completedTasks || [],
            likedStudents: likedStudents || [],
            staticLikes: staticLikes || [],
            staticResponds: staticResponds || [],
            companyCompletedTasks: companyCompleted || []
        });
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        res.status(500).json({ error: 'Ошибка загрузки данных' });
    }
});

app.post('/api/sync', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    const userId = req.session.userId;
    const data = req.body;

    try {
        if (data.tasks) {
            await db.syncUserTasks(userId, data.tasks);
        }
        if (data.activeTasks) {
            await db.syncStudentActiveTasks(userId, data.activeTasks);
        }
        if (data.completedTasks) {
            await db.syncStudentCompletedTasks(userId, data.completedTasks);
        }
        if (data.likedStudents) {
            await db.syncLikedStudents(userId, data.likedStudents);
        }
        if (data.staticLikes) {
            await db.syncStaticLikes(userId, data.staticLikes);
        }
        if (data.staticResponds) {
            await db.syncStaticResponds(userId, data.staticResponds);
        }
        if (data.companyCompletedTasks) {
            await db.syncCompanyCompletedTasks(userId, data.companyCompletedTasks);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка синхронизации:', error);
        res.status(500).json({ error: 'Ошибка синхронизации' });
    }
});

app.post('/api/tasks', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    const { title, price, level, stack, description, deadline, isUrgent, tags } = req.body;

    if (!title) {
        return res.status(400).json({ error: 'Название задачи обязательно' });
    }

    try {
        const taskId = await db.createTask({
            userId: req.session.userId,
            title,
            price: price || 'от 0',
            level: level || 'Junior',
            stack: stack || '',
            description: description || '',
            deadline: deadline || '',
            isUrgent: isUrgent || false,
            tags: tags || []
        });

        res.json({
            success: true,
            taskId: taskId
        });
    } catch (error) {
        console.error('Ошибка создания задачи:', error);
        res.status(500).json({ error: 'Ошибка создания задачи' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
    console.log(`📁 Статика раздаётся из папки "public"`);
});
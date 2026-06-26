const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ Ошибка подключения к БД:', err.message);
    } else {
        console.log('✅ Подключено к SQLite');
        initDatabase();
    }
});

// ============================================
//  ИНИЦИАЛИЗАЦИЯ ТАБЛИЦ
// ============================================

function initDatabase() {
    // Таблица пользователей - поле "group" заменено на "user_group"
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('student', 'company')),
            company_name TEXT DEFAULT '',
            user_group TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('❌ Ошибка создания таблицы users:', err.message);
        }
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            price TEXT NOT NULL,
            level TEXT NOT NULL,
            stack TEXT,
            description TEXT,
            deadline TEXT,
            is_urgent INTEGER DEFAULT 0,
            tags TEXT,
            is_liked INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('❌ Ошибка создания таблицы tasks:', err.message);
        }
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS student_active_tasks (
            student_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            task_title TEXT NOT NULL,
            task_price TEXT NOT NULL,
            task_level TEXT NOT NULL,
            task_stack TEXT,
            task_description TEXT,
            task_deadline TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (student_id, task_id),
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('❌ Ошибка создания таблицы student_active_tasks:', err.message);
        }
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS student_completed_tasks (
            student_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            task_title TEXT NOT NULL,
            task_price TEXT NOT NULL,
            task_level TEXT NOT NULL,
            task_stack TEXT,
            task_description TEXT,
            task_deadline TEXT,
            completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (student_id, task_id),
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('❌ Ошибка создания таблицы student_completed_tasks:', err.message);
        }
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS liked_students (
            company_id INTEGER NOT NULL,
            student_card_id TEXT NOT NULL,
            PRIMARY KEY (company_id, student_card_id),
            FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('❌ Ошибка создания таблицы liked_students:', err.message);
        }
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS static_likes (
            user_id INTEGER NOT NULL,
            card_index INTEGER NOT NULL,
            PRIMARY KEY (user_id, card_index),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('❌ Ошибка создания таблицы static_likes:', err.message);
        }
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS static_responds (
            user_id INTEGER NOT NULL,
            card_index INTEGER NOT NULL,
            PRIMARY KEY (user_id, card_index),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('❌ Ошибка создания таблицы static_responds:', err.message);
        }
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS company_completed_tasks (
            company_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            PRIMARY KEY (company_id, task_id),
            FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('❌ Ошибка создания таблицы company_completed_tasks:', err.message);
        }
    });

    console.log('✅ Все таблицы созданы/проверены');
}

// ============================================
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С БД
// ============================================

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            resolve(this);
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            resolve(row);
        });
    });
}

function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
}

// ============================================
//  ПОЛЬЗОВАТЕЛИ
// ============================================

async function registerUser(email, password, name, role, companyName, userGroup) {
    // Проверка на существование
    const existing = await getQuery('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
        throw new Error('Пользователь с таким email уже существует');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const companyNameValue = role === 'company' ? (companyName || '') : '';
    const groupValue = role === 'student' ? (userGroup || '') : '';

    const result = await runQuery(
        `INSERT INTO users (email, password, name, role, company_name, user_group) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [email, hashedPassword, name, role, companyNameValue, groupValue]
    );

    return { userId: result.lastID };
}

async function loginUser(email, password) {
    const user = await getQuery('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
        throw new Error('Пользователь не найден');
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
        throw new Error('Неверный пароль');
    }

    return user;
}

async function getUserById(id) {
    return getQuery('SELECT id, email, name, role, company_name, user_group FROM users WHERE id = ?', [id]);
}

// ============================================
//  ЗАДАЧИ (ДЛЯ КОМПАНИЙ)
// ============================================

async function getUserTasks(userId) {
    const rows = await allQuery(
        'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
    );
    return rows.map(row => ({
        ...row,
        tags: row.tags ? JSON.parse(row.tags) : [],
        isUrgent: !!row.is_urgent,
        isLiked: !!row.is_liked
    }));
}

async function createTask(taskData) {
    const { userId, title, price, level, stack, description, deadline, isUrgent, tags } = taskData;
    
    const result = await runQuery(
        `INSERT INTO tasks (user_id, title, price, level, stack, description, deadline, is_urgent, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, title, price, level, stack, description, deadline, isUrgent ? 1 : 0, JSON.stringify(tags)]
    );
    
    return result.lastID;
}

async function syncUserTasks(userId, tasks) {
    // Удаляем старые задачи пользователя
    await runQuery('DELETE FROM tasks WHERE user_id = ?', [userId]);
    
    // Вставляем новые
    for (const task of tasks) {
        await runQuery(
            `INSERT INTO tasks (id, user_id, title, price, level, stack, description, deadline, is_urgent, tags, is_liked)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                task.id,
                userId,
                task.title,
                task.price,
                task.level || 'Junior',
                task.stack || '',
                task.description || '',
                task.deadline || '',
                task.isUrgent ? 1 : 0,
                JSON.stringify(task.tags || []),
                task.isLiked ? 1 : 0
            ]
        );
    }
}

// ============================================
//  СТУДЕНТЫ - АКТИВНЫЕ ЗАДАЧИ
// ============================================

async function getStudentActiveTasks(studentId) {
    const rows = await allQuery(
        'SELECT * FROM student_active_tasks WHERE student_id = ? ORDER BY created_at DESC',
        [studentId]
    );
    return rows;
}

async function syncStudentActiveTasks(studentId, tasks) {
    await runQuery('DELETE FROM student_active_tasks WHERE student_id = ?', [studentId]);
    
    for (const task of tasks) {
        await runQuery(
            `INSERT INTO student_active_tasks 
             (student_id, task_id, task_title, task_price, task_level, task_stack, task_description, task_deadline)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                studentId,
                task.id || task.task_id,
                task.title || task.task_title,
                task.price || task.task_price,
                task.level || task.task_level || 'Junior',
                task.stack || task.task_stack || '',
                task.description || task.task_description || '',
                task.deadline || task.task_deadline || ''
            ]
        );
    }
}

// ============================================
//  СТУДЕНТЫ - ВЫПОЛНЕННЫЕ ЗАДАЧИ
// ============================================

async function getStudentCompletedTasks(studentId) {
    const rows = await allQuery(
        'SELECT * FROM student_completed_tasks WHERE student_id = ? ORDER BY completed_at DESC',
        [studentId]
    );
    return rows;
}

async function syncStudentCompletedTasks(studentId, tasks) {
    await runQuery('DELETE FROM student_completed_tasks WHERE student_id = ?', [studentId]);
    
    for (const task of tasks) {
        await runQuery(
            `INSERT INTO student_completed_tasks 
             (student_id, task_id, task_title, task_price, task_level, task_stack, task_description, task_deadline)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                studentId,
                task.id || task.task_id,
                task.title || task.task_title,
                task.price || task.task_price,
                task.level || task.task_level || 'Junior',
                task.stack || task.task_stack || '',
                task.description || task.task_description || '',
                task.deadline || task.task_deadline || ''
            ]
        );
    }
}

// ============================================
//  ИЗБРАННЫЕ СТУДЕНТЫ (ДЛЯ КОМПАНИЙ)
// ============================================

async function getLikedStudents(companyId) {
    const rows = await allQuery(
        'SELECT student_card_id FROM liked_students WHERE company_id = ?',
        [companyId]
    );
    return rows.map(r => r.student_card_id);
}

async function syncLikedStudents(companyId, likedList) {
    await runQuery('DELETE FROM liked_students WHERE company_id = ?', [companyId]);
    
    for (const cardId of likedList) {
        await runQuery(
            'INSERT INTO liked_students (company_id, student_card_id) VALUES (?, ?)',
            [companyId, cardId]
        );
    }
}

// ============================================
//  СТАТИЧНЫЕ ЛАЙКИ (НА СТРАНИЦЕ ЗАДАЧ)
// ============================================

async function getStaticLikes(userId) {
    const rows = await allQuery(
        'SELECT card_index FROM static_likes WHERE user_id = ?',
        [userId]
    );
    return rows.map(r => r.card_index);
}

async function syncStaticLikes(userId, likes) {
    await runQuery('DELETE FROM static_likes WHERE user_id = ?', [userId]);
    
    for (const index of likes) {
        await runQuery(
            'INSERT INTO static_likes (user_id, card_index) VALUES (?, ?)',
            [userId, index]
        );
    }
}

// ============================================
//  СТАТИЧНЫЕ ОТКЛИКИ (НА СТРАНИЦЕ ЗАДАЧ)
// ============================================

async function getStaticResponds(userId) {
    const rows = await allQuery(
        'SELECT card_index FROM static_responds WHERE user_id = ?',
        [userId]
    );
    return rows.map(r => r.card_index);
}

async function syncStaticResponds(userId, responds) {
    await runQuery('DELETE FROM static_responds WHERE user_id = ?', [userId]);
    
    for (const index of responds) {
        await runQuery(
            'INSERT INTO static_responds (user_id, card_index) VALUES (?, ?)',
            [userId, index]
        );
    }
}

// ============================================
//  ВЫПОЛНЕННЫЕ ЗАДАЧИ КОМПАНИИ
// ============================================

async function getCompanyCompletedTasks(companyId) {
    const rows = await allQuery(
        'SELECT task_id FROM company_completed_tasks WHERE company_id = ?',
        [companyId]
    );
    return rows.map(r => r.task_id);
}

async function syncCompanyCompletedTasks(companyId, tasks) {
    await runQuery('DELETE FROM company_completed_tasks WHERE company_id = ?', [companyId]);
    
    for (const taskId of tasks) {
        await runQuery(
            'INSERT INTO company_completed_tasks (company_id, task_id) VALUES (?, ?)',
            [companyId, taskId]
        );
    }
}

// ============================================
//  ЭКСПОРТ ВСЕХ ФУНКЦИЙ
// ============================================

module.exports = {
    // Пользователи
    registerUser,
    loginUser,
    getUserById,
    
    // Задачи
    getUserTasks,
    createTask,
    syncUserTasks,
    
    // Студенты - активные задачи
    getStudentActiveTasks,
    syncStudentActiveTasks,
    
    // Студенты - выполненные задачи
    getStudentCompletedTasks,
    syncStudentCompletedTasks,
    
    // Избранные студенты
    getLikedStudents,
    syncLikedStudents,
    
    // Статичные лайки
    getStaticLikes,
    syncStaticLikes,
    
    // Статичные отклики
    getStaticResponds,
    syncStaticResponds,
    
    // Выполненные задачи компании
    getCompanyCompletedTasks,
    syncCompanyCompletedTasks
};
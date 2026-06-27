const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new Database(DB_PATH);

// ============================================
//  ИНИЦИАЛИЗАЦИЯ ТАБЛИЦ
// ============================================

function initDatabase() {
    // Таблица пользователей
    db.exec(`
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
    `);

    // Таблица задач
    db.exec(`
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
    `);

    // Таблица активных задач студента
    db.exec(`
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
    `);

    // Таблица выполненных задач студента
    db.exec(`
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
    `);

    // Таблица избранных студентов
    db.exec(`
        CREATE TABLE IF NOT EXISTS liked_students (
            company_id INTEGER NOT NULL,
            student_card_id TEXT NOT NULL,
            PRIMARY KEY (company_id, student_card_id),
            FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Таблица статичных лайков
    db.exec(`
        CREATE TABLE IF NOT EXISTS static_likes (
            user_id INTEGER NOT NULL,
            card_index INTEGER NOT NULL,
            PRIMARY KEY (user_id, card_index),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Таблица статичных откликов
    db.exec(`
        CREATE TABLE IF NOT EXISTS static_responds (
            user_id INTEGER NOT NULL,
            card_index INTEGER NOT NULL,
            PRIMARY KEY (user_id, card_index),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Таблица выполненных задач компании
    db.exec(`
        CREATE TABLE IF NOT EXISTS company_completed_tasks (
            company_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            PRIMARY KEY (company_id, task_id),
            FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    console.log('✅ Все таблицы созданы/проверены');
}

// ============================================
//  ФУНКЦИИ ДЛЯ РАБОТЫ С БД
// ============================================

function runQuery(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.run(...params);
}

function getQuery(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.get(...params);
}

function allQuery(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
}

// ============================================
//  ПОЛЬЗОВАТЕЛИ
// ============================================

async function registerUser(email, password, name, role, companyName, userGroup) {
    const existing = getQuery('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
        throw new Error('Пользователь с таким email уже существует');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const companyNameValue = role === 'company' ? (companyName || '') : '';
    const groupValue = role === 'student' ? (userGroup || '') : '';

    const result = runQuery(
        `INSERT INTO users (email, password, name, role, company_name, user_group) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [email, hashedPassword, name, role, companyNameValue, groupValue]
    );

    return { userId: result.lastInsertRowid };
}

async function loginUser(email, password) {
    const user = getQuery('SELECT * FROM users WHERE email = ?', [email]);
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
//  ЗАДАЧИ
// ============================================

async function getUserTasks(userId) {
    const rows = allQuery(
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
    
    const result = runQuery(
        `INSERT INTO tasks (user_id, title, price, level, stack, description, deadline, is_urgent, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, title, price, level, stack, description, deadline, isUrgent ? 1 : 0, JSON.stringify(tags)]
    );
    
    return result.lastInsertRowid;
}

async function syncUserTasks(userId, tasks) {
    runQuery('DELETE FROM tasks WHERE user_id = ?', [userId]);
    
    for (const task of tasks) {
        runQuery(
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
//  СТУДЕНТЫ
// ============================================

async function getStudentActiveTasks(studentId) {
    return allQuery(
        'SELECT * FROM student_active_tasks WHERE student_id = ? ORDER BY created_at DESC',
        [studentId]
    );
}

async function syncStudentActiveTasks(studentId, tasks) {
    runQuery('DELETE FROM student_active_tasks WHERE student_id = ?', [studentId]);
    
    for (const task of tasks) {
        runQuery(
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

async function getStudentCompletedTasks(studentId) {
    return allQuery(
        'SELECT * FROM student_completed_tasks WHERE student_id = ? ORDER BY completed_at DESC',
        [studentId]
    );
}

async function syncStudentCompletedTasks(studentId, tasks) {
    runQuery('DELETE FROM student_completed_tasks WHERE student_id = ?', [studentId]);
    
    for (const task of tasks) {
        runQuery(
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
//  ИЗБРАННЫЕ СТУДЕНТЫ
// ============================================

async function getLikedStudents(companyId) {
    const rows = allQuery(
        'SELECT student_card_id FROM liked_students WHERE company_id = ?',
        [companyId]
    );
    return rows.map(r => r.student_card_id);
}

async function syncLikedStudents(companyId, likedList) {
    runQuery('DELETE FROM liked_students WHERE company_id = ?', [companyId]);
    
    for (const cardId of likedList) {
        runQuery(
            'INSERT INTO liked_students (company_id, student_card_id) VALUES (?, ?)',
            [companyId, cardId]
        );
    }
}

// ============================================
//  СТАТИЧНЫЕ ЛАЙКИ/ОТКЛИКИ
// ============================================

async function getStaticLikes(userId) {
    const rows = allQuery(
        'SELECT card_index FROM static_likes WHERE user_id = ?',
        [userId]
    );
    return rows.map(r => r.card_index);
}

async function syncStaticLikes(userId, likes) {
    runQuery('DELETE FROM static_likes WHERE user_id = ?', [userId]);
    
    for (const index of likes) {
        runQuery(
            'INSERT INTO static_likes (user_id, card_index) VALUES (?, ?)',
            [userId, index]
        );
    }
}

async function getStaticResponds(userId) {
    const rows = allQuery(
        'SELECT card_index FROM static_responds WHERE user_id = ?',
        [userId]
    );
    return rows.map(r => r.card_index);
}

async function syncStaticResponds(userId, responds) {
    runQuery('DELETE FROM static_responds WHERE user_id = ?', [userId]);
    
    for (const index of responds) {
        runQuery(
            'INSERT INTO static_responds (user_id, card_index) VALUES (?, ?)',
            [userId, index]
        );
    }
}

// ============================================
//  ВЫПОЛНЕННЫЕ ЗАДАЧИ КОМПАНИИ
// ============================================

async function getCompanyCompletedTasks(companyId) {
    const rows = allQuery(
        'SELECT task_id FROM company_completed_tasks WHERE company_id = ?',
        [companyId]
    );
    return rows.map(r => r.task_id);
}

async function syncCompanyCompletedTasks(companyId, tasks) {
    runQuery('DELETE FROM company_completed_tasks WHERE company_id = ?', [companyId]);
    
    for (const taskId of tasks) {
        runQuery(
            'INSERT INTO company_completed_tasks (company_id, task_id) VALUES (?, ?)',
            [companyId, taskId]
        );
    }
}

// ============================================
//  ЗАПУСК И ЭКСПОРТ
// ============================================

// Инициализируем базу данных при старте
initDatabase();

module.exports = {
    registerUser,
    loginUser,
    getUserById,
    getUserTasks,
    createTask,
    syncUserTasks,
    getStudentActiveTasks,
    syncStudentActiveTasks,
    getStudentCompletedTasks,
    syncStudentCompletedTasks,
    getLikedStudents,
    syncLikedStudents,
    getStaticLikes,
    syncStaticLikes,
    getStaticResponds,
    syncStaticResponds,
    getCompanyCompletedTasks,
    syncCompanyCompletedTasks
};
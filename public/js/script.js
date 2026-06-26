// ============================================
//  УПРАВЛЕНИЕ РОЛЯМИ
// ============================================

function applyRoleInterface(role) {
    // Сначала скрываем вообще все ролевые элементы
    document.querySelectorAll('[data-role]').forEach(el => {
        el.style.setProperty('display', 'none', 'important');
    });

    // Включаем элементы только для выбранной роли
    if (role === 'company') {
        document.querySelectorAll('[data-role="company-only"]').forEach(el => {
            if(el.tagName === 'LI') {
                el.style.setProperty('display', 'list-item', 'important');
            } else {
                el.style.setProperty('display', 'block', 'important');
            }
        });
    } else if (role === 'student') {
        document.querySelectorAll('[data-role="student-only"]').forEach(el => {
            el.style.setProperty('display', 'block', 'important');
        });
    }
}

function setRole(role) {
    localStorage.setItem('userRole', role);
    applyRoleInterface(role);
}

// ============================================
//  ПОДКЛЮЧЕНИЕ К БЭКЕНДУ
// ============================================

// --- 1. ЗАГРУЗКА ДАННЫХ С СЕРВЕРА ---
async function loadUserData() {
    try {
        const response = await fetch('/api/user-data', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            console.log('Пользователь не авторизован');
            return;
        }
        
        const data = await response.json();
        
        if (data.user) {
            // Сохраняем данные пользователя
            localStorage.setItem('userName', data.user.name);
            localStorage.setItem('userRole', data.user.role);
            localStorage.setItem('companyName', data.user.companyName || '');
            localStorage.setItem('userGroup', data.user.group || '');
            localStorage.setItem('userId', data.user.id);
            
            // Загружаем задачи
            if (data.tasks) {
                localStorage.setItem('customTasks', JSON.stringify(data.tasks));
            }
            if (data.activeTasks) {
                localStorage.setItem('activeTasks', JSON.stringify(data.activeTasks));
            }
            if (data.completedTasks) {
                localStorage.setItem('completedTasks', JSON.stringify(data.completedTasks));
            }
            if (data.likedStudents) {
                localStorage.setItem('likedStudents', JSON.stringify(data.likedStudents));
            }
            if (data.staticLikes) {
                localStorage.setItem('staticLikes', JSON.stringify(data.staticLikes));
            }
            if (data.staticResponds) {
                localStorage.setItem('staticResponds', JSON.stringify(data.staticResponds));
            }
            if (data.companyCompletedTasks) {
                localStorage.setItem('companyCompletedTasks', JSON.stringify(data.companyCompletedTasks));
            }
            
            // Перерисовываем интерфейс
            if (typeof renderCompanyTasks === 'function') renderCompanyTasks();
            if (typeof renderTasks === 'function') renderTasks();
            if (typeof applyRoleInterface === 'function') {
                applyRoleInterface(data.user.role);
            }
            
            // Восстанавливаем лайки на статичных карточках
            if (typeof restoreStaticLikes === 'function') restoreStaticLikes();
            
            console.log('✅ Данные загружены с сервера');
        }
    } catch (error) {
        console.log('❌ Ошибка загрузки данных:', error);
    }
}

// --- 2. СИНХРОНИЗАЦИЯ С СЕРВЕРОМ ---
async function syncUserData() {
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    
    const payload = {
        tasks: JSON.parse(localStorage.getItem('customTasks') || '[]'),
        activeTasks: JSON.parse(localStorage.getItem('activeTasks') || '[]'),
        completedTasks: JSON.parse(localStorage.getItem('completedTasks') || '[]'),
        likedStudents: JSON.parse(localStorage.getItem('likedStudents') || '[]'),
        staticLikes: JSON.parse(localStorage.getItem('staticLikes') || '[]'),
        staticResponds: JSON.parse(localStorage.getItem('staticResponds') || '[]'),
        companyCompletedTasks: JSON.parse(localStorage.getItem('companyCompletedTasks') || '[]')
    };
    
    try {
        await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        console.log('✅ Данные синхронизированы');
    } catch (error) {
        console.log('❌ Ошибка синхронизации:', error);
    }
}

// --- 3. АВТОМАТИЧЕСКАЯ СИНХРОНИЗАЦИЯ ---
let syncTimeout = null;

function setupAutoSync() {
    const originalSetItem = localStorage.setItem;
    const syncKeys = [
        'customTasks', 'activeTasks', 'completedTasks', 
        'likedStudents', 'staticLikes', 'staticResponds', 
        'companyCompletedTasks'
    ];
    
    localStorage.setItem = function(key, value) {
        originalSetItem.call(this, key, value);
        
        if (syncKeys.includes(key)) {
            clearTimeout(syncTimeout);
            syncTimeout = setTimeout(syncUserData, 500);
        }
    };
}

// --- 4. ВЫХОД ИЗ АККАУНТА ---
async function logoutUser() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.log('Ошибка выхода:', error);
    }
    
    // Очищаем локальные данные
    localStorage.clear();
    window.location.href = 'index.html';
}

// --- 5. ПЕРЕХОД В ЛИЧНЫЙ КАБИНЕТ ---
function goToProfile() {
    const role = localStorage.getItem('userRole') || 'student';
    window.location.href = role === 'company' ? 'lk-company.html' : 'lk-student.html';
}

// ============================================
//  ОСНОВНАЯ ЛОГИКА СТРАНИЦЫ
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // --- ЗАГРУЗКА РОЛИ ---
    const savedRole = localStorage.getItem('userRole') || 'student';
    applyRoleInterface(savedRole);
    
    // --- ЗАГРУЗКА ДАННЫХ ---
    loadUserData();
    
    // --- НАСТРОЙКА АВТОСИНХРОНИЗАЦИИ ---
    setupAutoSync();
    
    // --- НАХОДИМ ВСЕ НЕОБХОДИМЫЕ ЭЛЕМЕНТЫ ИНТЕРФЕЙСА ---
    const modal = document.getElementById('orderModal');
    const openHeaderLink = document.querySelector('.btn__order--log'); 
    const openBottomBtn = document.getElementById('toggleTaskBtn');    
    const closeModalBtn = document.getElementById('closeModalBtn');
    const form = document.getElementById('createOrderForm');
    const tasksGrid = document.querySelector('.tasks__grid');
    
    let selectedTags = [];

    // --- 1. ЕДИНАЯ ФУНКЦИЯ ОТРИСОВКИ КАРТОЧКИ В СЕТКУ ---
    function renderCard(taskData, prepend = false) {
        if (!tasksGrid) return;

        const newCard = document.createElement('article');
        newCard.classList.add('task-card');
        
        if (taskData.isUrgent) {
            newCard.classList.add('task-card--hot');
        }
        
        const cardId = taskData.id || Date.now();
        newCard.dataset.id = cardId;

        const description = taskData.description || "Описание задачи не заполнено.";
        const stack = taskData.stack || "Не указан";
        const deadline = taskData.deadline || "Не указан";
        const tags = Array.isArray(taskData.tags) ? taskData.tags : [];
        const tagsHTML = tags.map(tag => `<span class="task-card__tag">${tag}</span>`).join('');

        const isLiked = taskData.isLiked ? ' active' : '';

        const activeTasks = JSON.parse(localStorage.getItem('activeTasks')) || [];
        const isSubmitted = activeTasks.some(t => String(t.id) === String(cardId));
        
        const btnClass = isSubmitted ? 'task-card__action-btn btn-respond submitted' : 'task-card__action-btn btn-respond';
        const btnText = isSubmitted ? 'Резюме отправлено' : 'Откликнуться';

        const cardCompanyName = taskData.company || localStorage.getItem('companyName') || localStorage.getItem('userName') || '';
        const cleanName = cardCompanyName.trim().toLowerCase().replace(/["'«»]/g, '');

        const brandMiniImages = {
            'самокат': '/image/samokat.png',
            'мегамаркет': '/image/megamarket.png',
            'нетология': '/image/netologia.png',
            'самолет': '/image/plan.png',
            'вкусно и точка': '/image/vkusno-i-tochka.png',
            'яндекс лавка': '/image/yandex_lavka.png'
        };

        let companyLogoHTML = '';
        if (brandMiniImages[cleanName]) {
            companyLogoHTML = `<img src="${brandMiniImages[cleanName]}" alt="${cardCompanyName}" style="height: 25px; max-width: 106px; object-fit: contain; display: block;">`;
        } else {
            companyLogoHTML = `<span style="font-weight: 600; font-size: 13px; color: var(--color-text-gray); max-width: 110px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${cardCompanyName || 'Компания'}</span>`;
        }

        newCard.innerHTML = `
            <div class="task-card__header">
                <h3 class="task-card__title gradient-card">${taskData.title}</h3>
                <span class="task-card__price">${taskData.price}</span>
            </div>
            <div class="task-card__info">
                <span class="task-card__level" style="color: #4A90E2;">${taskData.level}</span>
                <div class="task-card__company" style="margin-left: auto; margin-bottom: 0px; margin-top: 0px; height: 27px;">
                    ${companyLogoHTML}
                </div>
            </div>
            <div class="task-card__footer">
                <div class="task-card__tags">
                    ${tagsHTML || '<span class="task-card__tag">Разное</span>'}
                </div>
                <button class="task-card__like${isLiked}" type="button" aria-label="Добавить в избранное">
                    <svg class="heart-icon--outline" xmlns="http://w3.org" width="21" height="19" viewBox="0 0 21 19" fill="none">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M0 5.99938C0 2.60984 2.79985 0 6.08628 0C7.78035 0 9.27104 0.843638 10.3408 1.93524C11.4105 0.843638 12.9012 0 14.5952 0C17.8817 0 20.6815 2.60984 20.6815 5.99938C20.6815 8.32125 19.7492 10.3631 18.4576 12.0891C17.1682 13.812 15.4815 15.2743 13.8666 16.4626C13.2498 16.9164 12.6258 17.3351 12.0547 17.644C11.5184 17.934 10.9018 18.1997 10.3408 18.1997C9.77971 18.1997 9.16309 17.934 8.62683 17.644C8.05572 17.3351 7.43171 16.9164 6.81489 16.4626C5.19998 15.2743 3.51334 13.812 2.22394 12.0891C0.9323 10.3631 0 8.32126 0 5.99938ZM6.08628 1.88273C3.62902 1.88273 1.7727 3.80199 1.7727 5.99938C1.7727 7.76098 2.4768 9.4011 3.61169 10.9176C4.74881 12.4371 6.27882 13.7777 7.8244 14.9149C8.40925 15.3453 8.96011 15.7114 9.4313 15.9663C9.93735 16.24 10.2305 16.317 10.3408 16.317C10.4511 16.317 10.7442 16.24 11.2502 15.9663C11.7214 15.7114 12.2723 15.3453 12.8571 14.9149C14.4027 13.7777 15.9327 12.4371 17.0698 10.9176C18.2047 9.4011 18.9088 7.76098 18.9088 5.99938C18.9088 3.80248 17.0525 1.88322 14.5952 1.88322C13.184 1.88322 11.8662 2.77868 11.0434 3.91522C10.8756 4.14697 10.616 4.28229 10.3408 4.28229C10.0655 4.28229 9.80588 4.14697 9.6381 3.91522C8.81529 2.77868 7.49752 1.88322 6.08628 1.88322Z" fill="black"/>
                    </svg>
                    <svg class="heart-icon--filled" xmlns="http://w3.org" width="21" height="19" viewBox="0 0 21 19" fill="none">
                        <path d="M10.3408 18.1997C9.77971 18.1997 9.16309 17.934 8.62683 17.644C8.05572 17.3351 7.43171 16.9164 6.81489 16.4626C5.19998 15.2743 3.51334 13.812 2.22394 12.0891C0.9323 10.3631 0 8.32126 0 5.99938C0 2.60984 2.79985 0 6.08628 0C7.78035 0 9.27104 0.843638 10.3408 1.93524C11.4105 0.843638 12.9012 0 14.5952 0C17.8817 0 20.6815 2.60984 20.6815 5.99938C20.6815 8.32125 19.7492 10.3631 18.4576 12.0891C17.1682 13.812 15.4815 15.2743 13.8666 16.4626C13.2498 16.9164 12.6258 17.3351 12.0547 17.644C11.5184 17.934 10.9018 18.1997 10.3408 18.1997Z" fill="#C70000"/>
                    </svg>
                </button>
            </div>
            <div class="task-card__expandable">
                <div class="task-card__divider"></div>
                <div class="task-card__details">
                    <p class="task-card__stack"><strong>Стек:</strong> ${stack}</p>
                    <p class="task-card__description">${description}</p>
                    <p class="task-card__deadline"><strong>Срок выполнения:</strong> ${deadline}</p>
                </div>
                <button class="${btnClass}" type="button" data-role="student-only">${btnText}</button>
            </div>
        `;

        if (prepend) {
            tasksGrid.insertBefore(newCard, tasksGrid.firstChild);
        } else {
            tasksGrid.appendChild(newCard);
        }
    }

    // --- 2. ЗАГРУЗКА ИЗ LOCALSTORAGE ПРИ СТАРТЕ СТРАНИЦЫ ---
    function loadSavedTasks() {
        const savedTasks = JSON.parse(localStorage.getItem('customTasks')) || [];
        savedTasks.forEach(task => {
            renderCard(task, false); 
        });
        
        if (typeof applyRoleInterface === "function") {
            const currentRole = localStorage.getItem('userRole') || 'student';
            applyRoleInterface(currentRole);
        }
    }
    
    function restoreStaticLikes() {
        const staticLikes = JSON.parse(localStorage.getItem('staticLikes')) || [];
        const staticResponds = JSON.parse(localStorage.getItem('staticResponds')) || [];
        
        const allCards = document.querySelectorAll('.tasks__grid .task-card');
        
        allCards.forEach((card, index) => {
            if (!card.dataset.id) {
                if (staticLikes.includes(index)) {
                    const likeBtn = card.querySelector('.task-card__like');
                    if (likeBtn) likeBtn.classList.add('active');
                }
                
                if (staticResponds.includes(index)) {
                    const respondBtn = card.querySelector('.btn-respond') || card.querySelector('.task-card__action-btn');
                    if (respondBtn) {
                        respondBtn.textContent = 'Резюме отправлено';
                        respondBtn.classList.add('submitted');
                    }
                }
            }
        });
    }

    loadSavedTasks();
    restoreStaticLikes();

    // --- 3. УПРАВЛЕНИЕ МОДАЛЬНЫМ ОКНОМ ---
    function openModal(e) {
        if (e) e.preventDefault();
        if (modal) modal.classList.add('is-visible');
    }

    function closeModal() {
        if (!modal) return;
        modal.classList.remove('is-visible');
        if (form) form.reset(); 
        document.querySelectorAll('.modal-tag').forEach(t => t.classList.remove('is-selected'));
        selectedTags = [];
        if (openBottomBtn) openBottomBtn.classList.remove('is-active');
    }

    if (openHeaderLink) openHeaderLink.addEventListener('click', openModal);
    if (openBottomBtn) openBottomBtn.addEventListener('click', openModal);
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    // --- 4. ВЫБОР ТЕГОВ В МОДАЛКЕ ---
    document.querySelectorAll('.modal-tag').forEach(tagElement => {
        tagElement.addEventListener('click', () => {
            const tagValue = tagElement.getAttribute('data-tag');
            
            if (selectedTags.includes(tagValue)) {
                selectedTags = selectedTags.filter(t => t !== tagValue);
                tagElement.classList.remove('is-selected');
            } else {
                selectedTags.push(tagValue);
                tagElement.classList.add('is-selected');
            }
        });
    });

    // --- 5. ОБРАБОТКА И ОТПРАВКА ФОРМЫ (СОЗДАНИЕ ЗАДАЧИ) ---
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const title = document.getElementById('taskTitle').value.trim();
            const price = document.getElementById('taskPrice').value.trim();
            const stackInput = document.getElementById('taskStack').value.trim();
            const description = document.getElementById('taskDesc').value.trim();
            const deadline = document.getElementById('taskDeadline').value.trim();
            
            const level = document.querySelector('input[name="level"]:checked').value;
            const pricePrefix = document.querySelector('input[name="priceType"]:checked').value;
            const isUrgent = document.getElementById('urgentTask').checked;

            let tagsFromStack = [...selectedTags];
            if (stackInput !== "") {
                const extraTags = stackInput.split(',').map(t => t.trim());
                extraTags.forEach(t => {
                    if (t && !tagsFromStack.includes(t)) tagsFromStack.push(t);
                });
            }

            const finalPrice = price.includes('₽') ? price : `${pricePrefix}${price}`;

            const newTask = {
                id: Date.now(),
                title: title,
                price: finalPrice,
                level: level,
                isUrgent: isUrgent,
                tags: tagsFromStack,
                stack: stackInput || 'Не указан',
                description: description || 'Описание задачи не заполнено.',
                deadline: deadline || 'Не указан',
                isLiked: false,
                company: localStorage.getItem('companyName') || localStorage.getItem('userName') || 'Компания'
            };

            // Сохраняем в localStorage
            const currentTasks = JSON.parse(localStorage.getItem('customTasks')) || [];
            currentTasks.unshift(newTask);
            localStorage.setItem('customTasks', JSON.stringify(currentTasks));

            // Отправляем на сервер
            try {
                await fetch('/api/tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(newTask)
                });
            } catch (error) {
                console.log('Ошибка сохранения задачи на сервере:', error);
            }

            renderCard(newTask, true);

            if (typeof applyRoleInterface === "function") {
                applyRoleInterface(localStorage.getItem('userRole') || 'student');
            }
            applyFilters(); 
            closeModal();
        });
    }

    // --- 6. ГЛОБАЛЬНОЕ ДЕЛЕГИРОВАНИЕ КЛИКОВ ---
    document.addEventListener('click', (event) => {
        // 1. КЛИК НА СЕРДЕЧКО
        const likeBtn = event.target.closest('.task-card__like');
        if (likeBtn) {
            likeBtn.classList.toggle('active');
            
            const card = likeBtn.closest('.task-card') || likeBtn.closest('.student-card-item');
            if (!card) return;

            const cardId = card.dataset.id;
            const isCurrentlyActive = likeBtn.classList.contains('active');

            // Студент
            if (cardId && cardId.includes('student')) {
                let likedStudents = JSON.parse(localStorage.getItem('likedStudents')) || [];
                if (isCurrentlyActive) {
                    if (!likedStudents.includes(cardId)) likedStudents.push(cardId);
                } else {
                    likedStudents = likedStudents.filter(id => id !== cardId);
                }
                localStorage.setItem('likedStudents', JSON.stringify(likedStudents));
                return;
            }

            // Динамическая задача
            if (cardId && cardId.length > 5) {
                let currentTasks = JSON.parse(localStorage.getItem('customTasks')) || [];
                currentTasks = currentTasks.map(task => {
                    if (String(task.id) === String(cardId)) {
                        task.isLiked = isCurrentlyActive;
                    }
                    return task;
                });
                localStorage.setItem('customTasks', JSON.stringify(currentTasks));
                return;
            }

            // Статичная задача
            const allGridCards = Array.from(document.querySelectorAll('.tasks__grid .task-card'));
            const cardIndex = allGridCards.indexOf(card);
            
            if (cardIndex !== -1) {
                let staticLikes = JSON.parse(localStorage.getItem('staticLikes')) || [];
                
                if (isCurrentlyActive) {
                    if (!staticLikes.includes(cardIndex)) staticLikes.push(cardIndex);
                } else {
                    staticLikes = staticLikes.filter(index => index !== cardIndex);
                }
                localStorage.setItem('staticLikes', JSON.stringify(staticLikes));
            }
            return;
        }

        // 2. КЛИК НА КНОПКУ "ОТКЛИКНУТЬСЯ"
        const respondBtn = event.target.closest('.btn-respond') || event.target.closest('.task-card__action-btn');
        
        if (respondBtn && !respondBtn.classList.contains('submitted')) {
            const card = respondBtn.closest('.task-card');
            if (!card) return;
            
            respondBtn.textContent = 'Резюме отправлено';
            respondBtn.classList.add('submitted');

            const taskId = card.dataset.id;
            const expandableBlock = card.querySelector('.task-card__expandable');
            const fullStack = expandableBlock ? expandableBlock.querySelector('.task-card__stack')?.textContent.replace('Стек:', '').trim() : 'Не указан';
            const fullDesc = expandableBlock ? expandableBlock.querySelector('.task-card__description')?.textContent.trim() : 'Описание задачи не заполнено.';
            const fullDeadline = expandableBlock ? expandableBlock.querySelector('.task-card__deadline')?.textContent.replace('Срок выполнения:', '').trim() : 'Не указан';

            if (taskId) {
                const taskData = {
                    id: Number(taskId),
                    title: card.querySelector('.task-card__title').textContent.trim(),
                    price: card.querySelector('.task-card__price').textContent.trim(),
                    level: card.querySelector('.task-card__level')?.textContent.trim() || 'Junior',
                    stack: fullStack,
                    description: fullDesc,
                    deadline: fullDeadline
                };

                let activeTasks = JSON.parse(localStorage.getItem('activeTasks')) || [];
                if (!activeTasks.some(t => t.id === taskData.id)) {
                    activeTasks.push(taskData);
                    localStorage.setItem('activeTasks', JSON.stringify(activeTasks));
                }
            } else {
                const allCards = Array.from(document.querySelectorAll('.tasks__grid .task-card'));
                const cardIndex = allCards.indexOf(card);
                
                if (cardIndex !== -1) {
                    let staticResponds = JSON.parse(localStorage.getItem('staticResponds')) || [];
                    if (!staticResponds.includes(cardIndex)) {
                        staticResponds.push(cardIndex);
                        localStorage.setItem('staticResponds', JSON.stringify(staticResponds));
                    }

                    let activeTasks = JSON.parse(localStorage.getItem('activeTasks')) || [];
                    const staticTaskData = {
                        id: `static_${cardIndex}`,
                        title: card.querySelector('.task-card__title').textContent.trim(),
                        price: card.querySelector('.task-card__price').textContent.trim(),
                        level: card.querySelector('.task-card__level')?.textContent.trim() || 'Junior',
                        stack: fullStack,
                        description: fullDesc,
                        deadline: fullDeadline
                    };
                    if (!activeTasks.some(t => t.id === staticTaskData.id)) {
                        activeTasks.push(staticTaskData);
                        localStorage.setItem('activeTasks', JSON.stringify(activeTasks));
                    }
                }
            }
        }
    });

    // --- 7. ОЧИСТКА ИСТОРИИ ЗАДАЧ ---
    const clearTasksBtn = document.getElementById('clearTasksBtn');
    
    if (clearTasksBtn) {
        clearTasksBtn.addEventListener('click', () => {
            if (confirm('Вы уверены, что хотите удалить все созданные карточки?')) {
                localStorage.removeItem('customTasks');
                
                if (tasksGrid) {
                    const dynamicCards = tasksGrid.querySelectorAll('.task-card');
                    dynamicCards.forEach(card => {
                        if (card.querySelector('[data-role="student-only"]') || card.querySelector('.btn-respond')) {
                            card.remove();
                        }
                    });
                }
                
                alert('История добавленных задач успешно очищена!');
            }
        });
    }

    // --- 8. ЛОГИКА МУЛЬТИФИЛЬТРАЦИИ ---
    function applyFilters() {
        const activeFilterElements = document.querySelectorAll('.filters__btn.is-active');
        const activeTags = Array.from(activeFilterElements).map(btn => btn.textContent.trim().toLowerCase());

        const allCards = document.querySelectorAll('.tasks__grid .task-card');

        allCards.forEach(card => {
            const cardTagElements = card.querySelectorAll('.task-card__tag');
            const cardTags = Array.from(cardTagElements).map(tag => tag.textContent.trim().toLowerCase());

            if (activeTags.length === 0) {
                card.classList.remove('is-hidden');
            } else {
                const hasAllTags = activeTags.every(tag => cardTags.includes(tag));
                
                if (hasAllTags) {
                    card.classList.remove('is-hidden');
                } else {
                    card.classList.add('is-hidden');
                }
            }
        });
    }

    const filterButtons = document.querySelectorAll('.filters__btn'); 
    
    if (filterButtons.length > 0) {
        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                button.classList.toggle('is-active');
                applyFilters();
            });
        });
    }

    // --- 9. ВЫХОД ИЗ АККАУНТА ---
    const logoutBtn = document.querySelector('.header__auth-logout');
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logoutUser);
    }

    // --- 10. ПЕРЕХОД В ЛИЧНЫЙ КАБИНЕТ ---
    const profileAvatar = document.querySelector('.header__profile-avatar');

    if (profileAvatar) {
        profileAvatar.addEventListener('click', (e) => {
            e.preventDefault();
            goToProfile();
        });
    }

    // --- 11. ИНИЦИАЛИЗАЦИЯ ЛАЙКОВ НА СТРАНИЦЕ СТУДЕНТОВ ---
    function initStudentPageLikes() {
        const studentCards = document.querySelectorAll('.student-card-item');
        if (studentCards.length === 0) return;

        const likedStudents = JSON.parse(localStorage.getItem('likedStudents')) || [];

        studentCards.forEach(card => {
            const studentId = card.dataset.id;
            if (studentId && likedStudents.includes(studentId)) {
                const likeBtn = card.querySelector('.task-card__like');
                if (likeBtn) {
                    likeBtn.classList.add('active');
                }
            }
        });
    }

    initStudentPageLikes();

    // --- 12. УМНОЕ РАСПОЗНАВАНИЕ БРЕНДА ---
    const savedCompanyName = localStorage.getItem('companyName') || localStorage.getItem('userName') || '';
    const brandContainer = document.getElementById('company-profile-name');

    if (brandContainer) {
        const cleanName = savedCompanyName.trim().toLowerCase().replace(/["'«»]/g, '');

        const brandLogos = {
            'самокат': `
                <div style="display: flex; align-items: center; gap: 15px; color: #FF2E74; font-family: 'Inter', sans-serif; font-size: 54px; font-weight: 700;">
                    <img src="/image/samokat.png" alt="Самокат" style="height: 55px; width: auto; object-fit: contain;">
                    <span>самокат</span>
                </div>
            `,
            'мегамаркет': `
                <div style="display: flex; align-items: center; gap: 15px; color: #6B27B0; font-family: 'Inter', sans-serif; font-size: 54px; font-weight: 700; letter-spacing: -1px;">
                    <img src="/image/megamarket.png" alt="Мегамаркет" style="height: 55px; width: auto; object-fit: contain;">
                    <span>мегамаркет</span>
                </div>
            `,
            'нетология': `
                <div style="display: flex; align-items: center; gap: 15px; color: #000000; font-family: 'Inter', sans-serif; font-size: 54px; font-weight: 700;">
                    <img src="/image/netologia.png" alt="Нетология" style="height: 55px; width: auto; object-fit: contain;">
                    <span>нетология</span>
                </div>
            `,
            'самолет': `
                <div style="display: flex; align-items: center; gap: 15px; color: #0073F0; font-family: 'Inter', sans-serif; font-size: 54px; font-weight: 600;">
                    <img src="/image/plan.png" alt="Самолет" style="height: 55px; width: auto; object-fit: contain;">
                    <span>самолет</span>
                </div>
            `,
            'вкусно и точка': `
                <div style="display: flex; align-items: center;">
                    <img src="/image/vkusno-i-tochka.png" alt="Вкусно и точка" style="height: 60px; width: auto; object-fit: contain;">
                </div>
            `,
            'яндекс лавка': `
                <div style="display: flex; align-items: center;">
                    <img src="/image/yandex_lavka.png" alt="Яндекс Лавка" style="height: 60px; width: auto; object-fit: contain;">
                </div>
            `
        };

        if (brandLogos[cleanName]) {
            brandContainer.innerHTML = brandLogos[cleanName];
        } else {
            brandContainer.textContent = savedCompanyName || "Моя Компания";
            brandContainer.style.color = "#1A202C";
            brandContainer.style.fontSize = "54px";
            brandContainer.style.fontWeight = "700";
            brandContainer.style.textTransform = "none";
        }
    }
});
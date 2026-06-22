// js/vote.js
// Globale Variablen
let selectedDances = [];
let availableDances = [];
let currentCourseId = null;
let currentCourseDanceCount = 0;
let currentCoupleName = '';
let currentUserId = null;

// DOM Elements
const courseNameTitle = document.getElementById('courseName');
const coupleNameInput = document.getElementById('coupleName');
const saveNameBtn = document.getElementById('saveNameBtn');
const nameStatus = document.getElementById('nameStatus');
const availableDancesContainer = document.getElementById('availableDances');
const selectedDancesContainer = document.getElementById('selectedDances');
const submitVoteBtn = document.getElementById('submitVoteBtn');
const resetBtn = document.getElementById('resetBtn');
const voteSuccessModal = document.getElementById('voteSuccess');
const closeSuccessBtn = document.getElementById('closeSuccessBtn');
const maxPointsSpan = document.getElementById('maxPoints');
const progressLabel = document.getElementById('progressLabel');

// Initialisierung
async function initialize() {
    try {
        // 1. URL Parameter holen (?course=montag-19)
        const urlParams = new URLSearchParams(window.location.search);
        currentCourseId = urlParams.get('course');

        if (!currentCourseId) {
            courseNameTitle.textContent = 'Kein Kurs ausgewählt!';
            window.location.href = 'index.html';
            return;
        }

        // 2. Anonymous Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signInAnonymously();
        if (authError) throw authError;
        currentUserId = authData.user.id;

        // 3. Kursdaten und Tänze aus DB laden
        await loadCourseData(currentCourseId);

        // 4. Prüfen, ob dieses Gerät in diesem Kurs schon abgestimmt hat
        const { data: existingVote } = await supabaseClient
            .from('votes')
            .select('couple_name, ranking')
            .eq('course_id', currentCourseId)
            .eq('user_id', currentUserId)
            .maybeSingle();

        if (existingVote) {
            coupleNameInput.value = existingVote.couple_name;
            currentCoupleName = existingVote.couple_name;
            
            selectedDances = existingVote.ranking.map((danceName, index) => {
                const danceData = availableDances.find(d => d.name === danceName);
                return danceData ? { ...danceData, rank: index + 1 } : null;
            }).filter(d => d !== null);
            
            renderAvailableDances();
            renderSelectedDances();
            showStatus('Willkommen zurück! Ihr könnt eure Stimme hier anpassen.', 'success');
        } else {
            const savedName = localStorage.getItem(`tanzvote_couple_name_${currentCourseId}`);
            if (savedName) {
                coupleNameInput.value = savedName;
                currentCoupleName = savedName;
            }
        }

        setupEventListeners();
        updateProgress();

    } catch (error) {
        console.error('Initialisierung fehlgeschlagen:', error);
        showStatus('Fehler beim Laden. Bitte Seite neu laden.', 'error');
    }
}

async function loadCourseData(courseId) {
    try {
        const { data: course, error: courseError } = await supabaseClient
            .from('courses')
            .select('name, dance_count')
            .eq('id', courseId)
            .single();

        if (courseError) throw courseError;

        courseNameTitle.textContent = course.name;
        currentCourseDanceCount = course.dance_count;
        maxPointsSpan.textContent = course.dance_count;

        const { data: dances, error: dancesError } = await supabaseClient
            .from('course_dances')
            .select('dances(id, name, icon)')
            .eq('course_id', courseId);

        if (dancesError) throw dancesError;

        availableDances = dances.map(item => ({
            id: item.dances.id,
            name: item.dances.name,
            icon: item.dances.icon || 'fa-music'
        }));

        renderAvailableDances();

    } catch (error) {
        console.error('Fehler beim Laden der Kursdaten:', error);
        showStatus('Kursdaten konnten nicht geladen werden.', 'error');
    }
}

function setupEventListeners() {
    saveNameBtn.addEventListener('click', saveCoupleName);
    coupleNameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') saveCoupleName(); });
    submitVoteBtn.addEventListener('click', submitVote);
    resetBtn.addEventListener('click', resetVoting);
    closeSuccessBtn.addEventListener('click', () => voteSuccessModal.classList.remove('show'));
}

function renderAvailableDances() {
    availableDancesContainer.innerHTML = '';
    availableDances.forEach(dance => {
        const isSelected = selectedDances.some(d => d.id === dance.id);
        const danceCard = document.createElement('div');
        danceCard.className = `dance-card ${isSelected ? 'selected' : ''}`;
        danceCard.setAttribute('role', 'button');
        danceCard.setAttribute('aria-label', `${dance.name} zur Auswahl hinzufügen`);
        danceCard.innerHTML = `<i class="fas ${dance.icon}"></i><h4>${dance.name}</h4>`;
        
        danceCard.addEventListener('click', () => {
            if (!isSelected) addDanceToSelection(dance);
        });
        
        availableDancesContainer.appendChild(danceCard);
    });
}

function addDanceToSelection(dance) {
    if (selectedDances.length >= availableDances.length) return;
    selectedDances.push({ ...dance, rank: selectedDances.length + 1 });
    renderAvailableDances();
    renderSelectedDances();
    updateProgress();
}

function renderSelectedDances() {
    selectedDancesContainer.innerHTML = '';
    if (selectedDances.length === 0) {
        selectedDancesContainer.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-light);"><i class="fas fa-arrow-left" style="font-size:2rem; margin-bottom:10px;"></i><p>Wähle Tänze aus der linken Spalte</p></div>`;
        return;
    }

    selectedDances.forEach((dance, index) => {
        const points = availableDances.length - index;
        const rankingItem = document.createElement('div');
        rankingItem.className = 'ranking-item';
        rankingItem.dataset.id = dance.id;
        rankingItem.innerHTML = `
            <div class="rank-number">${index + 1}</div>
            <div class="dance-name"><i class="fas ${dance.icon}" style="margin-right:10px;"></i>${dance.name}</div>
            <div class="points">${points} Pkt</div>
            <button class="remove-btn" data-id="${dance.id}" aria-label="${dance.name} entfernen"><i class="fas fa-times"></i></button>
        `;
        selectedDancesContainer.appendChild(rankingItem);
    });

    new Sortable(selectedDancesContainer, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: updateRanking
    });

    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const danceId = e.currentTarget.dataset.id;
            removeDanceFromSelection(danceId);
        });
    });
}

function removeDanceFromSelection(danceId) {
    selectedDances = selectedDances.filter(d => d.id !== danceId);
    renderAvailableDances();
    renderSelectedDances();
    updateProgress();
}

function updateRanking() {
    const items = selectedDancesContainer.querySelectorAll('.ranking-item');
    selectedDances = [];
    items.forEach((item, index) => {
        const danceId = item.dataset.id;
        const dance = availableDances.find(d => d.id === danceId);
        if (dance) selectedDances.push({ ...dance, rank: index + 1 });
    });
    renderSelectedDances();
    updateProgress();
}

function updateProgress() {
    const isSelected = selectedDances.length === availableDances.length;
    progressLabel.textContent = `${selectedDances.length} / ${availableDances.length} Tänze ausgewählt`;
    submitVoteBtn.disabled = !(isSelected && currentCoupleName && currentCourseId);
}

function saveCoupleName() {
    const name = coupleNameInput.value.trim();
    if (!name || name.length < 3) {
        showStatus('Bitte gebt einen Namen mit mind. 3 Zeichen ein.', 'error');
        return;
    }
    currentCoupleName = name;
    localStorage.setItem(`tanzvote_couple_name_${currentCourseId}`, name);
    showStatus('Name gespeichert!', 'success');
    updateProgress();
}

function showStatus(message, type) {
    nameStatus.textContent = message;
    nameStatus.className = `status-message ${type}`;
    setTimeout(() => { nameStatus.textContent = ''; nameStatus.className = 'status-message'; }, 3000);
}

async function submitVote() {
    if (submitVoteBtn.disabled) return;

    submitVoteBtn.disabled = true;
    submitVoteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Speichere...';

    try {
        const rankingArray = selectedDances.map(d => d.name);
        const { error } = await supabaseClient.rpc('submit_vote', {
            p_course_id: currentCourseId,
            p_couple_name: currentCoupleName,
            p_ranking: rankingArray,
            p_user_id: currentUserId
        });

        if (error) throw error;
        
        voteSuccessModal.classList.add('show');
        setTimeout(() => voteSuccessModal.classList.remove('show'), 3000);

    } catch (error) {
        console.error('Fehler:', error);
        showStatus('Fehler beim Speichern. Bitte versucht es erneut.', 'error');
    } finally {
        submitVoteBtn.disabled = false;
        submitVoteBtn.innerHTML = '<i class="fas fa-check-circle"></i> Abstimmung abgeben';
        updateProgress();
    }
}

function resetVoting() {
    selectedDances = [];
    renderAvailableDances();
    renderSelectedDances();
    updateProgress();
}

document.addEventListener('DOMContentLoaded', initialize);

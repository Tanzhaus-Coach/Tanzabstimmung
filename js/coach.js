// js/coach.js

// DOM Elements
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');

const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

const evalCourseSelect = document.getElementById('evalCourseSelect');
const evalResults = document.getElementById('evalResults');
let pointsChart = null;

const createCourseForm = document.getElementById('createCourseForm');
const createDanceForm = document.getElementById('createDanceForm');

// NEU: State für Edit-Modus
let isEditingCourse = false;
let editingCourseId = null;

// Initialisierung
async function initCoachDashboard() {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            showDashboard();
            loadAllAdminData();
        } else if (event === 'SIGNED_OUT') {
            showLogin();
        }
    });

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        showDashboard();
        loadAllAdminData();
    } else {
        showLogin();
    }

    setupEventListeners();
}

function showLogin() {
    loginSection.style.display = 'flex';
    dashboardSection.style.display = 'none';
}

function showDashboard() {
    loginSection.style.display = 'none';
    dashboardSection.style.display = 'block';
}

function setupEventListeners() {
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', async () => await supabaseClient.auth.signOut());

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    evalCourseSelect.addEventListener('change', loadEvaluationData);
    createCourseForm.addEventListener('submit', handleSaveCourse); // Umbenannt für Create & Update
    createDanceForm.addEventListener('submit', handleCreateDance);
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    loginError.textContent = 'Lade...';

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        loginError.textContent = 'Login fehlgeschlagen: ' + error.message;
    } else {
        loginError.textContent = '';
    }
}

async function loadAllAdminData() {
    await loadDancesForAdmin();
    await loadCoursesForAdmin();
}

// --- EVALUATION LOGIC ---
async function loadCoursesForAdmin() {
    const { data: courses } = await supabaseClient.from('courses').select('*').order('name');
    
    evalCourseSelect.innerHTML = '<option value="">-- Kurs wählen --</option>';
    if(courses) {
        courses.forEach(c => {
            evalCourseSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
        });
    }

    const list = document.getElementById('coursesList');
    list.innerHTML = '';
    if(courses) {
        courses.forEach(c => {
            list.innerHTML += `
                <li>
                    <span><strong>${c.name}</strong> <small style="color: var(--text-light);">(ID: ${c.id})</small></span>
                    <div>
                        <button class="edit-btn" onclick="startEditCourse('${c.id}', '${c.name.replace(/'/g, "\\'")}')"><i class="fas fa-edit"></i></button>
                        <button class="delete-btn" onclick="deleteCourse('${c.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </li>`;
        });
    }
}

async function loadEvaluationData() {
    const courseId = evalCourseSelect.value;
    if (!courseId) {
        evalResults.style.display = 'none';
        return;
    }

    evalResults.style.display = 'block';
    
    const { data: votes } = await supabaseClient.from('votes').select('*').eq('course_id', courseId);
    const { data: courseDances } = await supabaseClient.from('course_dances').select('dances(name)').eq('course_id', courseId);

    const danceNames = courseDances ? courseDances.map(cd => cd.dances.name) : [];
    const maxPoints = danceNames.length;

    const pointsAgg = {};
    danceNames.forEach(d => pointsAgg[d] = 0);

    if(votes) {
        votes.forEach(vote => {
            vote.ranking.forEach((danceName, index) => {
                const points = maxPoints - index;
                if (pointsAgg[danceName] !== undefined) {
                    pointsAgg[danceName] += points;
                }
            });
        });
    }

    renderChart(pointsAgg);
    renderVotesTable(votes || [], danceNames);
}

function renderChart(data) {
    const ctx = document.getElementById('pointsChart').getContext('2d');
    const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(item => item[0]);
    const values = sorted.map(item => item[1]);

    // NEU: Prüfen, ob das System im Dark Mode läuft
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const textColor = isDarkMode ? '#f1f5f9' : '#1e293b';
    const gridColor = isDarkMode ? '#334155' : '#e2e8f0';

    if (pointsChart) pointsChart.destroy();

    pointsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Gesamtpunkte',
                data: values,
                backgroundColor: '#6366f1',
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { 
                y: { 
                    beginAtZero: true,
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                },
                x: {
                    ticks: { color: textColor },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: {
                    labels: { color: textColor }
                }
            }
        }
    });
}

function renderVotesTable(votes, danceNames) {
    const table = document.getElementById('votesTable');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    let headerHtml = '<tr><th>Paar</th>';
    danceNames.forEach(d => headerHtml += `<th>${d}</th>`);
    headerHtml += '</tr>';
    thead.innerHTML = headerHtml;

    tbody.innerHTML = '';
    votes.forEach(vote => {
        let rowHtml = `<tr><td><strong>${vote.couple_name}</strong></td>`;
        danceNames.forEach(d => {
            const rank = vote.ranking.indexOf(d) + 1;
            let cellClass = '';
            if (rank === 1) cellClass = 'highlight-1';
            else if (rank === 2) cellClass = 'highlight-2';
            else if (rank === 3) cellClass = 'highlight-3';
            
            rowHtml += `<td class="${cellClass}">${rank > 0 ? rank : '-'}</td>`;
        });
        rowHtml += '</tr>';
        tbody.innerHTML += rowHtml;
    });
}

// --- ADMIN LOGIC ---
async function loadDancesForAdmin() {
    const { data: dances } = await supabaseClient.from('dances').select('*').order('name');
    
    const grid = document.getElementById('danceCheckboxes');
    grid.innerHTML = '';
    if(dances) {
        dances.forEach(d => {
            grid.innerHTML += `
                <div class="checkbox-item">
                    <input type="checkbox" id="dance_${d.id}" value="${d.id}">
                    <label for="dance_${d.id}">${d.name}</label>
                </div>`;
        });
    }

    const list = document.getElementById('dancesList');
    list.innerHTML = '';
    if(dances) {
        dances.forEach(d => {
            list.innerHTML += `
                <li>
                    <span><i class="fas ${d.icon}"></i> ${d.name}</span>
                    <button class="delete-btn" onclick="deleteDance('${d.id}')"><i class="fas fa-trash"></i></button>
                </li>`;
        });
    }
}

// NEU: Kombinierte Funktion für Erstellen und Bearbeiten
async function handleSaveCourse(e) {
    e.preventDefault();
    let id = document.getElementById('newCourseId').value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const name = document.getElementById('newCourseName').value.trim();
    
    if (!id && !isEditingCourse) {
        alert('Die Kurs-ID enthält keine gültigen Zeichen!');
        return;
    }
    
    const checkedBoxes = document.querySelectorAll('#danceCheckboxes input:checked');
    const danceIds = Array.from(checkedBoxes).map(cb => cb.value);

    if (danceIds.length === 0) {
        alert('Bitte mindestens einen Tanz auswählen!');
        return;
    }

    const mappings = danceIds.map(dId => ({ course_id: id, dance_id: dId }));

    if (isEditingCourse) {
        // --- UPDATE MODUS ---
        const { error: courseError } = await supabaseClient
            .from('courses')
            .update({ name: name, dance_count: danceIds.length })
            .eq('id', editingCourseId);

        if (courseError) { alert('Fehler: ' + courseError.message); return; }

        // Alte Verknüpfungen löschen und neue setzen
        await supabaseClient.from('course_dances').delete().eq('course_id', editingCourseId);
        const { error: mapError } = await supabaseClient.from('course_dances').insert(mappings);

        if (mapError) { alert('Fehler bei Tänzen: ' + mapError.message); return; }

        alert('Kurs erfolgreich aktualisiert!');
        cancelEdit();
    } else {
        // --- CREATE MODUS ---
        const { error: courseError } = await supabaseClient.from('courses').insert({
            id: id,
            name: name,
            dance_count: danceIds.length
        });

        if (courseError) { alert('Fehler: ' + courseError.message); return; }

        const { error: mapError } = await supabaseClient.from('course_dances').insert(mappings);

        if (mapError) { alert('Fehler bei Tänzen: ' + mapError.message); return; }

        alert('Kurs erfolgreich erstellt!');
        createCourseForm.reset();
    }
    
    loadAllAdminData();
}

// NEU: Edit-Modus starten
window.startEditCourse = async function(id, name) {
    isEditingCourse = true;
    editingCourseId = id;
    
    // Formular füllen
    document.getElementById('newCourseId').value = id;
    document.getElementById('newCourseId').disabled = true; // ID nicht änderbar
    document.getElementById('newCourseName').value = name;
    
    // Checkboxen resetten
    document.querySelectorAll('#danceCheckboxes input').forEach(cb => cb.checked = false);
    
    // Aktuelle Tänze des Kurses laden und anhaken
    const { data: mappings } = await supabaseClient.from('course_dances').select('dance_id').eq('course_id', id);
    if (mappings) {
        mappings.forEach(m => {
            const cb = document.getElementById(`dance_${m.dance_id}`);
            if (cb) cb.checked = true;
        });
    }
    
    // UI anpassen
    createCourseForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> Kurs aktualisieren';
    createCourseForm.insertAdjacentHTML('beforeend', '<button type="button" id="cancelEditBtn" class="btn-reset" style="margin-left:10px;">Abbrechen</button>');
    document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
    
    // Scrollen
    document.getElementById('newCourseId').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
    isEditingCourse = false;
    editingCourseId = null;
    createCourseForm.reset();
    document.getElementById('newCourseId').disabled = false;
    createCourseForm.querySelector('button[type="submit"]').innerHTML = 'Kurs erstellen';
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) cancelBtn.remove();
    document.querySelectorAll('#danceCheckboxes input').forEach(cb => cb.checked = false);
}

async function handleCreateDance(e) {
    e.preventDefault();
    const name = document.getElementById('newDanceName').value.trim();
    const icon = document.getElementById('newDanceIcon').value.trim() || 'fa-music';

    const { error } = await supabaseClient.from('dances').insert({ name, icon });
    if (error) { alert('Fehler: ' + error.message); return; }

    alert('Tanz hinzugefügt!');
    createDanceForm.reset();
    document.getElementById('newDanceIcon').value = 'fa-music';
    loadDancesForAdmin();
}

window.deleteCourse = async function(id) {
    if (!confirm('Kurs wirklich löschen? Alle Abstimmungen dazu werden ebenfalls gelöscht.')) return;
    await supabaseClient.from('courses').delete().eq('id', id);
    loadCoursesForAdmin();
}

window.deleteDance = async function(id) {
    if (!confirm('Tanz wirklich löschen? Er wird auch aus allen Kursen entfernt, die ihn nutzen.')) return;
    await supabaseClient.from('dances').delete().eq('id', id);
    loadDancesForAdmin();
}

window.exportToCSV = function() {
    const courseId = evalCourseSelect.value;
    if (!courseId) {
        alert("Bitte zuerst einen Kurs auswählen.");
        return;
    }

    const table = document.getElementById('votesTable');
    let csv = [];
    const rows = table.querySelectorAll('tr');
    
    for (let row of rows) {
        const cols = row.querySelectorAll('th, td');
        const rowData = Array.from(cols).map(col => {
            return '"' + col.innerText.replace(/"/g, '""') + '"';
        });
        csv.push(rowData.join(','));
    }
    
    const csvString = csv.join('\n');
    const blob = new Blob(["\uFEFF" + csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `auswertung_${courseId}_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

document.addEventListener('DOMContentLoaded', initCoachDashboard);

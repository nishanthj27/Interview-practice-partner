import { CONFIG, loadAppBootstrap } from './config.js';
import { authClient } from './auth.js';

let selectedJob = null;
let userInfo = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadAppBootstrap();
        const user = await authClient.requireAuth();

        if (!user) {
            return;
        }

        authClient.hydrateAuthUI(user);
        loadJobs();
        setupUserInfoForm();
    } catch (error) {
        alert(error.message || 'Unable to load the application right now.');
    }
});

function loadJobs() {
    const jobGrid = document.getElementById('jobGrid');

    if (!jobGrid) {
        return;
    }

    jobGrid.innerHTML = '';

    CONFIG.JOBS.forEach((job) => {
        const jobCard = createJobCard(job);
        jobGrid.appendChild(jobCard);
    });
}

function createJobCard(job) {
    const card = document.createElement('div');
    card.className = 'job-card';
    card.addEventListener('click', () => selectJob(job));
    card.innerHTML = `
        <span class="job-icon">${job.icon}</span>
        <h3>${job.title}</h3>
        <p>${job.description}</p>
    `;

    return card;
}

function selectJob(job) {
    selectedJob = job;
    document.getElementById('infoJobTitle').textContent = job.title;
    openUserInfoModal();
}

function setupUserInfoForm() {
    const form = document.getElementById('userInfoForm');

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        const formData = new FormData(form);
        userInfo = {
            fullName: formData.get('fullName').trim(),
            organization: formData.get('organization').trim(),
            degree: formData.get('degree').trim(),
            currentRole: formData.get('currentRole').trim(),
            timestamp: new Date().toISOString(),
        };

        if (!validateUserInfo(userInfo)) {
            return;
        }

        sessionStorage.setItem('userInfo', JSON.stringify(userInfo));
        closeUserInfoModal();

        setTimeout(() => {
            openModeModal();
        }, 300);
    });
}

function validateUserInfo(info) {
    if (!info.fullName || info.fullName.length < 2) {
        alert('Please enter a valid full name.');
        return false;
    }

    if (!info.organization || info.organization.length < 2) {
        alert('Please enter a valid organization, college, or university name.');
        return false;
    }

    if (!info.degree || info.degree.length < 2) {
        alert('Please enter your degree and major.');
        return false;
    }

    if (!info.currentRole || info.currentRole.length < 2) {
        alert('Please enter your current role or Student.');
        return false;
    }

    return true;
}

function openUserInfoModal() {
    const modal = document.getElementById('userInfoModal');
    modal.classList.add('active');

    setTimeout(() => {
        document.getElementById('fullName').focus();
    }, 100);
}

function closeUserInfoModal() {
    const modal = document.getElementById('userInfoModal');
    modal.classList.remove('active');

    if (!userInfo) {
        document.getElementById('userInfoForm').reset();
        selectedJob = null;
    }
}

function openModeModal() {
    if (!selectedJob) {
        alert('Please select a job role first.');
        return;
    }

    document.getElementById('selectedJobTitle').textContent = selectedJob.title;
    document.getElementById('modeModal').classList.add('active');
}

function closeModal() {
    document.getElementById('modeModal').classList.remove('active');
}

function selectMode(mode) {
    if (!selectedJob || !userInfo) {
        alert('Please complete the interview information form first.');
        return;
    }

    sessionStorage.setItem('selectedJob', JSON.stringify(selectedJob));
    sessionStorage.setItem('userInfo', JSON.stringify(userInfo));
    sessionStorage.removeItem('activeInterviewSession');

    if (mode === 'chat') {
        window.location.href = '/chat.html';
        return;
    }

    window.location.href = '/voice.html';
}

document.addEventListener('click', (event) => {
    const userInfoModal = document.getElementById('userInfoModal');
    const modeModal = document.getElementById('modeModal');

    if (event.target === userInfoModal) {
        closeUserInfoModal();
    }

    if (event.target === modeModal) {
        closeModal();
    }
});

document.addEventListener('keydown', (event) => {
    const userInfoModal = document.getElementById('userInfoModal');
    const modeModal = document.getElementById('modeModal');

    if (event.key !== 'Escape') {
        return;
    }

    if (userInfoModal.classList.contains('active')) {
        closeUserInfoModal();
    } else if (modeModal.classList.contains('active')) {
        closeModal();
    }
});

window.closeUserInfoModal = closeUserInfoModal;
window.closeModal = closeModal;
window.selectMode = selectMode;

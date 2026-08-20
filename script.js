const player = document.getElementById('audioPlayer');
const currentTitle = document.getElementById('currentTrackTitle');
const playPauseButton = document.getElementById('playPauseBtn');
const progressBar = document.getElementById('progressBar');
const timeDisplay = document.getElementById('timeDisplay');
let editMode = false;

function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
}

function updatePlayerControls() {
    const duration = Number.isFinite(player.duration) ? player.duration : 0;
    progressBar.value = duration ? (player.currentTime / duration) * 100 : 0;
    timeDisplay.textContent = `${formatTime(player.currentTime)} / ${formatTime(duration)}`;
    playPauseButton.textContent = player.paused ? 'Afspelen' : 'Pauzeren';
    playPauseButton.setAttribute('aria-label', player.paused ? 'Afspelen' : 'Pauzeren');
}

playPauseButton.addEventListener('click', () => {
    if (!player.src) return;
    if (player.paused) {
        player.play();
    } else {
        player.pause();
    }
});

progressBar.addEventListener('input', () => {
    if (Number.isFinite(player.duration)) {
        player.currentTime = (progressBar.value / 100) * player.duration;
    }
});

player.addEventListener('timeupdate', updatePlayerControls);
player.addEventListener('loadedmetadata', updatePlayerControls);
player.addEventListener('play', updatePlayerControls);
player.addEventListener('pause', updatePlayerControls);
updatePlayerControls();

document.getElementById('editModeBtn').addEventListener('click', () => {
    editMode = !editMode;
    const editModeButton = document.getElementById('editModeBtn');
    editModeButton.setAttribute('aria-pressed', editMode);
    document.getElementById('addPodcastSection').hidden = !editMode;
    document.querySelectorAll('.edit-only').forEach(element => {
        element.hidden = !editMode;
    });
});

function skipBy(seconds) {
    if (!player.src) return;

    const duration = Number.isFinite(player.duration) ? player.duration : player.currentTime + seconds;
    player.currentTime = Math.min(Math.max(player.currentTime + seconds, 0), duration);
}

document.getElementById('rewindBtn').addEventListener('click', () => skipBy(-10));
document.getElementById('forwardBtn').addEventListener('click', () => skipBy(10));

// Zodra de pagina laadt: haal oude podcasts en bladwijzers op
document.addEventListener('DOMContentLoaded', () => {
    loadPodcasts();
    loadBookmarks();
});

// 1. PODCAST TOEVOEGEN EN AFSPELEN
document.getElementById('addPodcastBtn').addEventListener('click', () => {
    const titleInput = document.getElementById('podcastTitleInput');
    const urlInput = document.getElementById('podcastUrlInput');
    
    if (titleInput.value.trim() !== "" && urlInput.value.trim() !== "") {
        const podcast = { title: titleInput.value.trim(), url: urlInput.value.trim() };
        savePodcast(podcast);
        addPodcastToDOM(podcast);
        titleInput.value = "";
        urlInput.value = "";
    }
});

document.getElementById('exportBookmarksBtn').addEventListener('click', () => {
    const bookmarks = getBookmarks();
    const file = new Blob([JSON.stringify(bookmarks, null, 2)], { type: 'application/json' });
    const downloadUrl = URL.createObjectURL(file);
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = 'blindspodcast-bladwijzers.json';
    downloadLink.click();
    URL.revokeObjectURL(downloadUrl);
});

document.getElementById('importBookmarksInput').addEventListener('change', (event) => {
    const [file] = event.target.files;
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener('load', () => {
        try {
            const importedBookmarks = JSON.parse(reader.result);
            if (!Array.isArray(importedBookmarks)) throw new Error('Ongeldig formaat');

            const bookmarks = getBookmarks();
            const existingBookmarks = new Set(bookmarks.map(bookmark =>
                `${bookmark.podcastUrl}|${bookmark.time}|${bookmark.name || ''}`
            ));
            const newBookmarks = importedBookmarks
                .filter(isValidBookmark)
                .map(normalizeBookmark)
                .filter(bookmark => {
                const bookmarkKey = `${bookmark.podcastUrl}|${bookmark.time}|${bookmark.name || ''}`;
                if (existingBookmarks.has(bookmarkKey)) return false;
                existingBookmarks.add(bookmarkKey);
                return true;
                });

            localStorage.setItem('bookmarks', JSON.stringify([...bookmarks, ...newBookmarks]));
            newBookmarks.forEach(addBookmarkToDOM);
            window.alert(`${newBookmarks.length} bladwijzer(s) geïmporteerd.`);
        } catch {
            window.alert('Het bestand bevat geen geldige bladwijzers.');
        }
        event.target.value = '';
    });
    reader.readAsText(file);
});

function isValidBookmark(bookmark) {
    return bookmark && typeof bookmark === 'object'
        && typeof bookmark.podcastTitle === 'string'
        && typeof bookmark.podcastUrl === 'string'
        && Number.isFinite(Number(bookmark.time));
}

function normalizeBookmark(bookmark) {
    const time = Number(bookmark.time);
    const displayTime = bookmark.displayTime || formatTime(time);
    return {
        ...bookmark,
        name: typeof bookmark.name === 'string' && bookmark.name.trim()
            ? bookmark.name
            : `Bladwijzer op ${displayTime}`,
        time,
        displayTime
    };
}

function addPodcastToDOM(podcast) {
    const ul = document.getElementById('podcastList');
    const li = document.createElement('li');
    li.setAttribute('tabindex', '0'); // Maakt het item selecteerbaar met het toetsenbord
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `Speel aflevering af: ${podcast.title}`);
    
    li.innerHTML = `<span>${podcast.title}</span> <button class="delete-btn edit-only" hidden type="button" aria-label="Verwijder aflevering ${podcast.title}">Verwijder</button>`;
    
    // Klik-actie om af te spelen
    const playTrack = (e) => {
        if (!e.target.classList.contains('delete-btn')) {
            player.src = podcast.url;
            currentTitle.innerText = `Nu aan het afspelen: ${podcast.title}`;
            player.play();
        }
    };

    li.addEventListener('click', playTrack);
    
    // Zorg dat Enter-toets ook werkt voor toetsenbordgebruikers
    li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') playTrack(e);
    });

    // Verwijderknop actie
    li.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation(); // Voorkomt dat de podcast gaat spelen bij het verwijderen
        li.remove();
        removePodcast(podcast.title);
    });

    ul.appendChild(li);
}

// 2. BLADWIJZERS MAKEN
document.getElementById('bookmarkBtn').addEventListener('click', () => {
    if (!player.src || player.src === "") return;
    
    const currentTime = player.currentTime; // De exacte seconde
    const minutes = Math.floor(currentTime / 60);
    const seconds = Math.floor(currentTime % 60).toString().padStart(2, '0');
    const timeString = `${minutes}:${seconds}`;
    
    const bookmark = {
        name: `Bladwijzer op ${timeString}`,
        podcastTitle: currentTitle.innerText.replace('Nu aan het afspelen: ', ''),
        podcastUrl: player.src,
        time: currentTime,
        displayTime: timeString
    };

    saveBookmark(bookmark);
    addBookmarkToDOM(bookmark);
});

function addBookmarkToDOM(bookmark) {
    const ul = document.getElementById('bookmarkList');
    const li = document.createElement('li');
    li.setAttribute('tabindex', '0');
    li.setAttribute('role', 'button');
    li.setAttribute('aria-label', `Spring naar ${bookmark.displayTime} in ${bookmark.podcastTitle}`);
    
    const bookmarkName = bookmark.name || `Bladwijzer op ${bookmark.displayTime}`;
    li.innerHTML = `<div><strong>${bookmarkName}</strong> <span class="time-tag">${bookmark.displayTime}</span><small class="bookmark-podcast">${bookmark.podcastTitle}</small></div><div class="bookmark-actions"><button class="rename-btn edit-only" hidden type="button">Naam aanpassen</button><button class="delete-btn edit-only" hidden type="button" aria-label="Verwijder bladwijzer op ${bookmark.displayTime}">Verwijder</button></div>`;
    
    // Klik-actie om naar bladwijzer te springen
    const jumpToBookmark = (e) => {
        if (!e.target.closest('button')) {
            player.src = bookmark.podcastUrl;
            currentTitle.innerText = `Nu aan het afspelen: ${bookmark.podcastTitle}`;
            player.currentTime = bookmark.time;
            player.play();
        }
    };

    li.addEventListener('click', jumpToBookmark);
    
    li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') jumpToBookmark(e);
    });

    li.querySelector('.rename-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const newName = window.prompt('Nieuwe naam voor deze bladwijzer:', bookmarkName);
        if (!newName || !newName.trim()) return;
        bookmark.name = newName.trim();
        updateBookmark(bookmark);
        li.querySelector('strong').textContent = bookmark.name;
    });

    // Verwijderknop actie
    li.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        li.remove();
        removeBookmark(bookmark.time);
    });

    ul.appendChild(li);
    li.querySelectorAll('.edit-only').forEach(element => {
        element.hidden = !editMode;
    });
}

// 3. LOCAL STORAGE OPSLAG FUNCTIES
function savePodcast(podcast) {
    let list = localStorage.getItem('podcasts') ? JSON.parse(localStorage.getItem('podcasts')) : [];
    list.push(podcast);
    localStorage.setItem('podcasts', JSON.stringify(list));
}
function loadPodcasts() {
    let list = localStorage.getItem('podcasts') ? JSON.parse(localStorage.getItem('podcasts')) : [];
    list.forEach(p => addPodcastToDOM(p));
}
function removePodcast(title) {
    let list = localStorage.getItem('podcasts') ? JSON.parse(localStorage.getItem('podcasts')) : [];
    list = list.filter(p => p.title !== title);
    localStorage.setItem('podcasts', JSON.stringify(list));
}
function saveBookmark(bm) {
    const list = getBookmarks();
    list.push(bm);
    localStorage.setItem('bookmarks', JSON.stringify(list));
}
function getBookmarks() {
    const storedBookmarks = localStorage.getItem('bookmarks');
    if (!storedBookmarks) return [];

    try {
        const bookmarks = JSON.parse(storedBookmarks);
        return Array.isArray(bookmarks) ? bookmarks : [];
    } catch {
        return [];
    }
}
function updateBookmark(bookmark) {
    const list = getBookmarks();
    const updatedList = list.map(savedBookmark => savedBookmark.time === bookmark.time ? bookmark : savedBookmark);
    localStorage.setItem('bookmarks', JSON.stringify(updatedList));
}
function loadBookmarks() {
    const list = getBookmarks();
    list.forEach(bm => addBookmarkToDOM(bm));
}
function removeBookmark(time) {
    let list = getBookmarks();
    list = list.filter(bm => bm.time !== time);
    localStorage.setItem('bookmarks', JSON.stringify(list));
}

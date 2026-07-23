// ==========================================
// MODULE MULTIJOUEUR (PeerJS, Salles & Invitations)
// ==========================================

let myPeer = null;
let isHost = true;
let hostConn = null;
let connections = {};
let appartementProprietaire = ""; // Déclaration propre sans lire currentUser immédiatement

function initialiserReseauApartment() {
    // Récupération sécurisée du nom d'utilisateur
    if (typeof currentUser === 'undefined' || !currentUser) {
        currentUser = localStorage.getItem('brawlUser') || "Joueur_" + Math.floor(Math.random()*1000);
    }
    
    appartementProprietaire = currentUser;

    // Room ID unique par joueur
    let myRoomId = "brawl-apt-" + currentUser.toLowerCase();

    myPeer = new Peer(myRoomId);

    myPeer.on('open', (id) => {
        isHost = true;
        appartementProprietaire = currentUser;
        mettreAJourBadgeNet("MON APPARTEMENT 🏠", "bg-warning text-dark");
        if (typeof chargerAppartementDepuisSheet === 'function') {
            chargerAppartementDepuisSheet();
        }
        annencerPresenceEnLigne();
    });

    myPeer.on('error', (err) => {
        console.warn("⚠️ PeerJS Note:", err.type);
    });

    myPeer.on('connection', (conn) => {
        let guestId = conn.peer;
        connections[guestId] = conn;

        conn.on('open', () => {
            conn.send({
                type: 'INIT_STATE',
                planchers: typeof planchersPieces !== 'undefined' ? planchersPieces : {},
                meubles: typeof meublesPlaces !== 'undefined' ? meublesPlaces : [],
                permissionEdition: typeof permissionEditionInvite !== 'undefined' ? permissionEditionInvite : false,
                owner: currentUser
            });
        });

        conn.on('data', (data) => { traiterDonneesReseau(data, conn); });
        conn.on('close', () => { 
            if (typeof otherPlayers !== 'undefined') delete otherPlayers[guestId]; 
            delete connections[guestId]; 
        });
    });
}

function mettreAJourBadgeNet(texte, bgClass) {
    const badge = document.getElementById('netRoleBadge');
    if (badge) {
        badge.innerText = texte;
        badge.className = `badge ${bgClass} brawl-font px-2 py-1`;
    }
}

function annencerPresenceEnLigne() {
    if (typeof APPS_SCRIPT_WEBAPP_URL !== 'undefined' && APPS_SCRIPT_WEBAPP_URL) {
        fetch(`${APPS_SCRIPT_WEBAPP_URL}?action=setPresenceCombat&username=${encodeURIComponent(currentUser)}&status=OUI`);
    }
}

function visiterAppartement(targetUsername) {
    if (targetUsername.toLowerCase() === currentUser.toLowerCase()) {
        retournerMonAppartement();
        return;
    }

    let targetRoomId = "brawl-apt-" + targetUsername.toLowerCase();
    if (hostConn) hostConn.close();

    hostConn = myPeer.connect(targetRoomId);

    hostConn.on('open', () => {
        isHost = false;
        appartementProprietaire = targetUsername;
        mettreAJourBadgeNet(`APPART DE ${targetUsername.toUpperCase()} 🌐`, "bg-info text-white");

        hostConn.send({ 
            type: 'JOIN', 
            username: currentUser, 
            x: player.x, y: player.y, 
            color: player.color,
            besoins: typeof besoins !== 'undefined' ? besoins : {}
        });

        let modalEl = document.getElementById('onlinePlayersModal');
        if (modalEl) {
            let modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }
    });

    hostConn.on('data', (data) => { traiterDonneesReseau(data, hostConn); });
    hostConn.on('close', () => {
        alert("🚪 Vous avez quitté l'appartement de " + targetUsername);
        retournerMonAppartement();
    });
}

function retournerMonAppartement() {
    if (hostConn) { hostConn.close(); hostConn = null; }
    isHost = true;
    appartementProprietaire = currentUser;
    mettreAJourBadgeNet("MON APPARTEMENT 🏠", "bg-warning text-dark");
    if (typeof chargerAppartementDepuisSheet === 'function') {
        chargerAppartementDepuisSheet();
    }

    let modalEl = document.getElementById('onlinePlayersModal');
    if (modalEl) {
        let modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
    }
}

function retransmettreATous(data, passPeerId = null) {
    if (!isHost) return;
    Object.keys(connections).forEach(id => {
        if (id !== passPeerId && connections[id] && connections[id].open) {
            connections[id].send(data);
        }
    });
}

function envoyerDonneesMulti(data) {
    if (isHost) {
        retransmettreATous(data);
    } else if (hostConn && hostConn.open) {
        hostConn.send(data);
    }
}

function traiterDonneesReseau(data, conn) {
    if (data.type === 'INIT_STATE') {
        if (data.planchers) planchersPieces = data.planchers;
        if (data.meubles) meublesPlaces = data.meubles;
        if (typeof permissionEditionInvite !== 'undefined') {
            permissionEditionInvite = !!data.permissionEdition;
        }
    }
    else if (data.type === 'PERMISSION_UPDATE') {
        if (typeof permissionEditionInvite !== 'undefined') {
            permissionEditionInvite = data.allowed;
            if (!permissionEditionInvite && typeof modeEditeur !== 'undefined' && modeEditeur && !isHost) {
                basculerModeEditeur();
            }
        }
    }
    else if (data.type === 'JOIN' || data.type === 'POS_UPDATE') {
        if (isHost) retransmettreATous(data, conn.peer);
        let pId = data.peerId || conn.peer;
        if (typeof otherPlayers !== 'undefined') {
            if (!otherPlayers[pId]) {
                otherPlayers[pId] = { 
                    username: data.username, 
                    x: data.x, 
                    y: data.y, 
                    color: data.color || '#ff0055',
                    actionEnCours: data.actionEnCours || false,
                    interactionType: data.interactionType || null
                };
            } else {
                otherPlayers[pId].x = data.x; 
                otherPlayers[pId].y = data.y;
                otherPlayers[pId].actionEnCours = data.actionEnCours || false;
                otherPlayers[pId].interactionType = data.interactionType || null;
            }
        }
    }
    else if (data.type === 'MEUBLE_UPDATE_ALL') {
        if (typeof meublesPlaces !== 'undefined') meublesPlaces = data.meubles;
        if (isHost) retransmettreATous(data, conn.peer);
    }
    else if (data.type === 'PLANCHER_UPDATE') {
        if (typeof planchersPieces !== 'undefined') planchersPieces[data.pieceId] = data.texture;
        if (isHost) retransmettreATous(data, conn.peer);
    }
}

function ouvrirListeJoueursEnLigne() {
    if (typeof APPS_SCRIPT_WEBAPP_URL === 'undefined' || !APPS_SCRIPT_WEBAPP_URL) return;

    let container = document.getElementById('onlinePlayersList');
    container.innerHTML = `<div class="text-warning py-3">⏳ Recherche des membres en ligne...</div>`;

    let modal = new bootstrap.Modal(document.getElementById('onlinePlayersModal'));
    modal.show();

    fetch(`${APPS_SCRIPT_WEBAPP_URL}?action=getMembresActifs&username=${encodeURIComponent(currentUser)}`)
        .then(res => res.json())
        .then(membres => {
            container.innerHTML = "";
            if (!Array.isArray(membres) || membres.length === 0) {
                container.innerHTML = `<div class="text-muted py-3">Aucun autre membre n'est connecté pour le moment.</div>`;
                return;
            }

            membres.forEach(m => {
                container.innerHTML += `
                    <div class="d-flex justify-content-between align-items-center bg-dark p-3 rounded mb-2 border border-secondary">
                        <span class="fw-bold fs-5 text-white">👤 ${m}</span>
                        <button class="btn brawl-btn btn-blue px-3 py-1" onclick="visiterAppartement('${m}')">
                            🚪 VISITER
                        </button>
                    </div>`;
            });
        })
        .catch(err => {
            container.innerHTML = `<div class="text-danger py-3">⚠️ Impossible de récupérer la liste.</div>`;
        });
}
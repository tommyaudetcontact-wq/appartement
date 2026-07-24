// ==========================================
// CONFIGURATION ET MOTEUR DU JEU
// ==========================================

const APPS_SCRIPT_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzKgKRkfVyQuNCrc0T13iH1orPFeWIZAK4kB_emnRFimN-ae_HzISIqUzZ_g1aWgPwHjg/exec";
const GITHUB_USERNAME = "tommyaudetcontact-wq";
const REPO_SPRITES = "appartements-assets";
const ASSETS_BASE_URL = `https://${GITHUB_USERNAME}.github.io/${REPO_SPRITES}/`;

let currentUser = null;
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let imagesCache = {};

function chargerImage(url) {
    if (!url) return null;
    if (imagesCache[url]) return imagesCache[url];
    let img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = url;
    imagesCache[url] = img;
    return img;
}

// LOGIQUE D'AUTHENTIFICATION AU DÉMARRAGE
window.addEventListener('DOMContentLoaded', () => {
    let savedUser = localStorage.getItem('brawlUser');
    if (savedUser) {
        currentUser = savedUser;
        demarrerPartieAppartement();
    } else {
        chargerMembresPourSelect();
    }
});

function chargerMembresPourSelect() {
    fetch(`${APPS_SCRIPT_WEBAPP_URL}?action=getMembres`)
        .then(res => res.json())
        .then(membres => {
            let select = document.getElementById('usernameSelect');
            select.innerHTML = '<option value="">-- Choisis ton nom --</option>';
            if (Array.isArray(membres)) {
                membres.forEach(m => {
                    let name = m.Nom || m;
                    if (name && name !== 'Admin') {
                        select.innerHTML += `<option value="${name}">${name}</option>`;
                    }
                });
            }
        })
        .catch(err => {
            document.getElementById('loginError').innerText = "Erreur de connexion au serveur.";
        });
}

function handleLoginAppartement() {
    let selected = document.getElementById('usernameSelect').value;
    if (!selected) {
        document.getElementById('loginError').innerText = "Veuillez sélectionner un membre.";
        return;
    }

    currentUser = selected;
    localStorage.setItem('brawlUser', currentUser);
    localStorage.setItem('brawlRole', 'joueur');

    demarrerPartieAppartement();
}

function demarrerPartieAppartement() {
    document.getElementById('loginPage').classList.add('d-none');
    document.getElementById('game-wrapper').classList.remove('d-none');

    let savedSkin = localStorage.getItem('brawlSkin_' + currentUser);
    if (savedSkin) {
        skinEquipe = savedSkin;
        if (typeof player !== 'undefined') player.skin = savedSkin;
    }

    if (typeof initialiserReseauApartment === 'function') {
        initialiserReseauApartment();
    }
    requestAnimationFrame(gameLoop);
}

function retournerAuMenuPrincipal() {
    window.location.href = "https://tommyaudetcontact-wq.github.io/brawlTasks2.0/";
}

// STRUCTURATION DES PIÈCES
const PIECES = {
    chambre: { id: 'chambre', nom: 'Chambre', x: 10, y: 10, w: 390, h: 240, colorDefault: '#b0bec5' },
    cuisine: { id: 'cuisine', nom: 'Cuisine', x: 410, y: 10, w: 380, h: 240, colorDefault: '#ffccbc' },
    salon:   { id: 'salon', nom: 'Salon', x: 10, y: 260, w: 540, h: 330, colorDefault: '#d7ccc8' },
    sdb:     { id: 'sdb', nom: 'Salle de Bain', x: 560, y: 260, w: 230, h: 330, colorDefault: '#b2ebf2' }
};

// HAUTEUR DES MURS EN RELIEF 2.5D
const HAUTEUR_MUR = 45;

// MURS AVEC TROUS/PORTES (DÉCOUPÉS EN SEGMENTS)
const murs = [
    { id: 'mur_nord', x: 0, y: 0, w: 800, h: 12 },
    { id: 'mur_ouest', x: 0, y: 0, w: 12, h: 600 },
    { id: 'mur_est', x: 788, y: 0, w: 12, h: 600 },
    { id: 'mur_sud', x: 0, y: 588, w: 800, h: 12 },

    { id: 'mur_sep_h1', x: 10, y: 250, w: 320, h: 12 }, 
    { id: 'mur_sep_h2', x: 430, y: 250, w: 360, h: 12 },

    { id: 'mur_sep_v1', x: 400, y: 10, w: 12, h: 90 }, 
    { id: 'mur_sep_v2', x: 400, y: 180, w: 12, h: 70 },

    { id: 'mur_sdb_v1', x: 550, y: 260, w: 12, h: 90 },
    { id: 'mur_sdb_v2', x: 550, y: 430, w: 12, h: 160 }
];

let planchersPieces = { chambre: null, cuisine: null, salon: null, sdb: null };
let meublesPlaces = [];
let curseurMouse = { x: 400, y: 300 };

function estUneFenetre(item) {
    if (!item || !item.type) return false;
    let t = item.type.toLowerCase();
    return t.includes('fenet') || t.includes('fenêt');
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let player = {
    x: 200, y: 400, radius: 14, speed: 3.2,
    dir: 'down', moving: false, animTimer: 0, color: '#00a6ff',
    skin: null
};

let otherPlayers = {};

// JOYSTICK TACTILE
const joystickContainer = document.getElementById('joystick-container');
const joystickKnob = document.getElementById('joystick-knob');
let joystickVector = { x: 0, y: 0 };
let joystickActive = false;

function handleTouchJoystick(e) {
    let touch = e.touches[0];
    if (!touch) return;

    let rect = joystickContainer.getBoundingClientRect();
    let centerX = rect.left + rect.width / 2;
    let centerY = rect.top + rect.height / 2;

    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    let dist = Math.hypot(dx, dy);
    let maxRadius = 38;

    if (dist > 0) {
        let clampedDist = Math.min(dist, maxRadius);
        let angle = Math.atan2(dy, dx);
        let knobX = Math.cos(angle) * clampedDist;
        let knobY = Math.sin(angle) * clampedDist;

        joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;
        joystickVector.x = dx / dist;
        joystickVector.y = dy / dist;
        joystickActive = true;
    }
}

function resetJoystick() {
    joystickKnob.style.transform = `translate(0px, 0px)`;
    joystickVector = { x: 0, y: 0 };
    joystickActive = false;
}

joystickContainer.addEventListener('touchstart', handleTouchJoystick, { passive: false });
joystickContainer.addEventListener('touchmove', handleTouchJoystick, { passive: false });
joystickContainer.addEventListener('touchend', resetJoystick);
joystickContainer.addEventListener('touchcancel', resetJoystick);

// DRAG ET SÉLECTION
let isDraggingMeuble = false;

function ObtenirCoordonneesMonde(clientX, clientY, appliqueDecalage = false) {
    let decalageY = appliqueDecalage ? 80 : 0;
    return {
        x: player.x + (clientX - canvas.width / 2),
        y: player.y + ((clientY - decalageY) - canvas.height / 2)
    };
}

function demarrerDrag(clientX, clientY) {
    if (!modeEditeur || !peutEditer()) return;

    let posExacte = ObtenirCoordonneesMonde(clientX, clientY, false);
    let posAjustee = ObtenirCoordonneesMonde(clientX, clientY, true);

    if (meubleEnModePlacement) {
        curseurMouse.x = posAjustee.x;
        curseurMouse.y = posAjustee.y;
        isDraggingMeuble = true;
    } else {
        if (verifierSelectionMeubleExistant(posExacte.x, posExacte.y)) {
            isDraggingMeuble = true;
            curseurMouse.x = posAjustee.x;
            curseurMouse.y = posAjustee.y;
        } else if (texturePlancherSelectionnee) {
            let murSurvole = obtenirMurSurvole(posExacte.x, posExacte.y);
            if (murSurvole) {
                murCibleEdition = murSurvole;
                pieceCibleEdition = null;
                document.getElementById('editor-target-name').innerText = "Mur : " + murSurvole.id;
            } else {
                let piece = obtenirPieceSurvolee(posExacte.x, posExacte.y);
                if (piece) {
                    pieceCibleEdition = piece;
                    murCibleEdition = null;
                    document.getElementById('editor-target-name').innerText = "Pièce : " + piece.nom;
                }
            }
        }
    }
}

function deplacerDrag(clientX, clientY) {
    if (isDraggingMeuble && meubleEnModePlacement) {
        let posAjustee = ObtenirCoordonneesMonde(clientX, clientY, true);
        curseurMouse.x = posAjustee.x;
        curseurMouse.y = posAjustee.y;
    }
}

function arreterDrag() { isDraggingMeuble = false; }

canvas.addEventListener('mousedown', (e) => demarrerDrag(e.clientX, e.clientY));
canvas.addEventListener('mousemove', (e) => deplacerDrag(e.clientX, e.clientY));
canvas.addEventListener('mouseup', arreterDrag);

canvas.addEventListener('touchstart', (e) => {
    if (e.target === canvas && e.touches.length > 0) {
        demarrerDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    if (isDraggingMeuble && e.touches.length > 0) {
        deplacerDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
}, { passive: false });

canvas.addEventListener('touchend', arreterDrag);

// GESTION DES BESOINS ET TEMPS
let besoins = { faim: 100, vessie: 100, energie: 100, hygiene: 100 };
let interactionActive = null; 
let actionEnCours = false;
let tempsActionDebut = 0;
let dureeActionTotale = 3000;
let tempsSansAlerte = 0;

function degraderBesoins(deltaTime) {
    besoins.faim = Math.max(0, besoins.faim - (100 / 600) * deltaTime);
    besoins.vessie = Math.max(0, besoins.vessie - (100 / 480) * deltaTime);
    besoins.energie = Math.max(0, besoins.energie - (100 / 900) * deltaTime);
    besoins.hygiene = Math.max(0, besoins.hygiene - (100 / 600) * deltaTime);

    let estDansLeRouge = (besoins.faim < 25 || besoins.vessie < 25 || besoins.energie < 25 || besoins.hygiene < 25);
    
    if (estDansLeRouge) {
        tempsSansAlerte = 0;
    } else {
        tempsSansAlerte += deltaTime;
        if (tempsSansAlerte >= 60) {
            attribuerRecompenseBonSoin();
            tempsSansAlerte = 0;
        }
    }

    mettreAJourHUD();
}

function attribuerRecompenseBonSoin() {
    if (typeof APPS_SCRIPT_WEBAPP_URL !== 'undefined' && APPS_SCRIPT_WEBAPP_URL && currentUser) {
        let gain = 0.10;
        if (typeof argentJoueur !== 'undefined') argentJoueur += gain;
        else argentJoueur = gain;

        if (typeof misaJourAffichageArgent === 'function') misaJourAffichageArgent();

        fetch(`${APPS_SCRIPT_WEBAPP_URL}?action=attribuerArgent&username=${encodeURIComponent(currentUser)}&money=0.10`)
            .then(res => res.json())
            .catch(err => console.error("⚠️ Erreur ajout argent Sheet :", err));
    }
}

function mettreAJourHUD() {
    const hudMoney = document.getElementById('hudUserMoney');
    if (hudMoney && typeof argentJoueur !== 'undefined') {
        hudMoney.innerText = argentJoueur.toFixed(2) + " $";
    }

    gererBarreBesoin('barFaim', 'valFaim', besoins.faim, 'bg-info');
    gererBarreBesoin('barEnergie', 'valEnergie', besoins.energie, 'bg-warning');
    gererBarreBesoin('barVessie', 'valVessie', besoins.vessie, 'bg-primary');
    gererBarreBesoin('barHygiene', 'valHygiene', besoins.hygiene, 'bg-success');
}

function gererBarreBesoin(barId, valId, valeur, colorClassDefaut) {
    const bar = document.getElementById(barId);
    const valTxt = document.getElementById(valId);
    if (!bar || !valTxt) return;

    valTxt.innerText = Math.round(valeur) + "%";
    bar.style.width = valeur + "%";

    if (valeur < 25) {
        bar.className = "need-bar-fill need-danger-alert";
    } else {
        bar.className = "need-bar-fill " + colorClassDefaut;
    }
}

function detecterInteractions() {
    if (modeEditeur) {
        if (actionEnCours) quitterAction();
        document.getElementById('interaction-prompt').style.display = 'none';
        return;
    }

    if (actionEnCours) {
        document.getElementById('interaction-prompt').style.display = 'flex';
        return;
    }

    let interactionTrouvee = null;

    for (let m of meublesPlaces) {
        if (estUneFenetre(m)) continue;
        let dist = Math.hypot(player.x - m.x, player.y - m.y);
        let rayonInteraction = Math.max(45, (m.w * (m.scale || 1)) / 2 + 25);

        if (dist < rayonInteraction) {
            let typeClean = (m.type || '').toLowerCase();

            if (typeClean === 'four' || typeClean === 'fours') interactionTrouvee = { type: 'manger', label: 'CUISINER 🍳' };
            else if (typeClean === 'lits') interactionTrouvee = { type: 'dormir', label: 'DORMIR 🛏️' };
            else if (typeClean === 'toilettes') interactionTrouvee = { type: 'toilette', label: 'TOILETTE 🚽' };
            else if (typeClean === 'douche' || typeClean === 'douches') interactionTrouvee = { type: 'douche', label: 'DOUCHE 🚿' };

            if (interactionTrouvee) break;
        }
    }

    const promptBox = document.getElementById('interaction-prompt');
    const btn = document.getElementById('btnInteraction');

    if (interactionTrouvee) {
        interactionActive = interactionTrouvee.type;
        btn.innerText = interactionTrouvee.label;
        btn.className = "btn brawl-btn btn-green fs-6";
        promptBox.style.display = 'flex';
    } else {
        interactionActive = null;
        promptBox.style.display = 'none';
    }
}

function quitterAction() {
    actionEnCours = false;
    const progressBox = document.getElementById('actionProgressBox');
    const progressBar = document.getElementById('actionProgressBar');
    if (progressBox) progressBox.style.display = 'none';
    if (progressBar) progressBar.style.width = "0%";
    detecterInteractions();
}

function executerInteraction() {
    if (actionEnCours) {
        quitterAction();
        return;
    }

    if (!interactionActive) return;

    actionEnCours = true;
    tempsActionDebut = performance.now();
    document.getElementById('actionProgressBox').style.display = 'block';
    
    const btn = document.getElementById('btnInteraction');
    btn.innerText = "ARRÊTER ❌";
    btn.className = "btn brawl-btn btn-pink fs-6";
}

function gererProgressionAction(maintenant) {
    if (!actionEnCours) return;

    let ecoule = maintenant - tempsActionDebut;
    let ratio = Math.min(1.0, ecoule / dureeActionTotale);

    document.getElementById('actionProgressBar').style.width = (ratio * 100) + "%";

    if (ratio >= 1.0) {
        if (interactionActive === 'manger') besoins.faim = Math.min(100, besoins.faim + 50);
        else if (interactionActive === 'dormir') besoins.energie = Math.min(100, besoins.energie + 50);
        else if (interactionActive === 'toilette') besoins.vessie = Math.min(100, besoins.vessie + 50);
        else if (interactionActive === 'douche') besoins.hygiene = Math.min(100, besoins.hygiene + 50);

        quitterAction();
    }
}

function obtenirPieceSurvolee(x, y) {
    for (let k in PIECES) {
        let p = PIECES[k];
        if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return p;
    }
    return null;
}

function obtenirMurSurvole(x, y) {
    for (let m of murs) {
        if (x >= m.x - 5 && x <= m.x + m.w + 5 && y >= m.y - HAUTEUR_MUR - 5 && y <= m.y + m.h + 5) return m;
    }
    return null;
}

function checkCollision(nx, ny) {
    for (let m of murs) {
        if (nx + player.radius > m.x && nx - player.radius < m.x + m.w &&
            ny + player.radius > m.y && ny - player.radius < m.y + m.h) return true;
    }
    return false;
}

function dessinerSolPiece(piece) {
    let textData = planchersPieces[piece.id];

    if (texturePlancherSelectionnee && pieceCibleEdition && pieceCibleEdition.id === piece.id) {
        let val = parseFloat(document.getElementById('tileSizeSlider').value) / 100.0;
        textData = { url: texturePlancherSelectionnee, scale: val };
    }

    if (textData) {
        let img = chargerImage(textData.url);
        if (img && img.complete && img.naturalWidth !== 0) {
            let pattern = ctx.createPattern(img, 'repeat');
            let scaleFactor = (200 / img.naturalWidth) * textData.scale;
            
            let matrix = new DOMMatrix().scale(scaleFactor, scaleFactor);
            pattern.setTransform(matrix);

            ctx.fillStyle = pattern;
            ctx.fillRect(piece.x, piece.y, piece.w, piece.h);
            return;
        }
    }

    ctx.fillStyle = piece.colorDefault;
    ctx.fillRect(piece.x, piece.y, piece.w, piece.h);
}

// RENDU DES MURS ET DES FENÊTRES AVEC FENÊTRES TOUJOURS AU-DESSUS DU MUR (Z-INDEX PRIORITAIRE)
function dessinerMur(m) {
    ctx.save();

    let enTrainDInstallerFenetre = false;
    if (meubleEnModePlacement && meubleEnModePlacement.type) {
        if (estUneFenetre(meubleEnModePlacement)) {
            enTrainDInstallerFenetre = true;
        }
    }

    let alpha = 1.0;

    if (!enTrainDInstallerFenetre) {
        let closestX_Player = Math.max(m.x, Math.min(player.x, m.x + m.w));
        let closestY_Player = Math.max(m.y - HAUTEUR_MUR, Math.min(player.y, m.y + m.h));
        let distPlayer = Math.hypot(player.x - closestX_Player, player.y - closestY_Player);

        let distMin = distPlayer;

        if (meubleEnModePlacement) {
            let closestX_Cursor = Math.max(m.x, Math.min(curseurMouse.x, m.x + m.w));
            let closestY_Cursor = Math.max(m.y - HAUTEUR_MUR, Math.min(curseurMouse.y, m.y + m.h));
            let distCursor = Math.hypot(curseurMouse.x - closestX_Cursor, curseurMouse.y - closestY_Cursor);
            
            distMin = Math.min(distPlayer, distCursor);
        }

        let maxDist = 70;
        if (distMin < maxDist) {
            let ratio = distMin / maxDist;
            alpha = Math.max(0.25, ratio);
        }
    }

    ctx.globalAlpha = alpha;

    // --- 1. FAÇADE DU MUR (PAPIER PEINT) ---
    let facadeX = m.x;
    let facadeY = m.y - HAUTEUR_MUR;
    let facadeW = m.w;
    let facadeH = m.h + HAUTEUR_MUR;

    let textData = papiersPeintsMurs[m.id];

    if (texturePlancherSelectionnee && murCibleEdition && murCibleEdition.id === m.id) {
        let sliderVal = parseFloat(document.getElementById('tileSizeSlider').value) / 100.0;
        textData = { url: texturePlancherSelectionnee, scale: sliderVal };
    }

    if (textData) {
        let img = chargerImage(textData.url);
        if (img && img.complete && img.naturalWidth !== 0) {
            let pattern = ctx.createPattern(img, 'repeat');
            let scaleFactor = (80 / img.naturalWidth) * textData.scale;
            let matrix = new DOMMatrix().scale(scaleFactor, scaleFactor);
            pattern.setTransform(matrix);

            ctx.fillStyle = pattern;
            ctx.fillRect(facadeX, facadeY, facadeW, facadeH);
        } else {
            ctx.fillStyle = "#5d4037";
            ctx.fillRect(facadeX, facadeY, facadeW, facadeH);
        }
    } else {
        ctx.fillStyle = "#5d4037";
        ctx.fillRect(facadeX, facadeY, facadeW, facadeH);
    }

    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(facadeX, facadeY, facadeW, facadeH);

    // --- 2. TRANCHE SUPÉRIEURE DU MUR (SE DESSINE SOUS LES FENÊTRES) ---
    ctx.fillStyle = "#3e2723";
    ctx.fillRect(m.x, m.y - HAUTEUR_MUR, m.w, Math.min(10, m.h));
    ctx.strokeRect(m.x, m.y - HAUTEUR_MUR, m.w, Math.min(10, m.h));

    // --- 3. DESSIN DES FENÊTRES POSÉES SUR CE MUR (PAR-DESSUS LA FAÇADE ET LA TRANCHE) ---
    let fenetresSurCeMur = meublesPlaces.filter(item => {
        if (!estUneFenetre(item)) return false;
        let hw = (item.w * (item.scale || 1)) / 2;
        let hh = (item.h * (item.scale || 1)) / 2;
        let fx = item.x;
        let fy = item.y;
        
        return (fx + hw >= m.x && fx - hw <= m.x + m.w &&
                fy + hh >= m.y - HAUTEUR_MUR - 15 && fy - hh <= m.y + m.h + 15);
    });

    if (typeof fenetresMurs !== 'undefined' && Array.isArray(fenetresMurs)) {
        fenetresMurs.filter(f => f.murId === m.id).forEach(f => fenetresSurCeMur.push(f));
    }

    fenetresSurCeMur.forEach(f => {
        let imgFen = chargerImage(f.url);
        let curW = Math.round(f.w * (f.scale || 1));
        let curH = Math.round(f.h * (f.scale || 1));

        ctx.save();
        ctx.translate(Math.round(f.x), Math.round(f.y));
        ctx.rotate((f.rotation || 0) * Math.PI / 180);

        if (imgFen && imgFen.complete && imgFen.naturalWidth !== 0) {
            ctx.drawImage(imgFen, -curW / 2, -curH / 2, curW, curH);
        } else {
            ctx.fillStyle = "#81d4fa";
            ctx.fillRect(-curW / 2, -curH / 2, curW, curH);
        }
        ctx.restore();
    });

    ctx.restore();
}

function dessinerAppartement() {
    // 1. Dessiner les sols de chaque pièce
    Object.keys(PIECES).forEach(k => dessinerSolPiece(PIECES[k]));

    // Aperçu de la pièce ou du mur sélectionné dans l'éditeur
    if (modeEditeur && texturePlancherSelectionnee) {
        if (pieceCibleEdition) {
            ctx.save();
            ctx.fillStyle = "rgba(0, 166, 255, 0.2)";
            ctx.fillRect(pieceCibleEdition.x, pieceCibleEdition.y, pieceCibleEdition.w, pieceCibleEdition.h);
            ctx.strokeStyle = "#10D010"; ctx.lineWidth = 4;
            ctx.strokeRect(pieceCibleEdition.x, pieceCibleEdition.y, pieceCibleEdition.w, pieceCibleEdition.h);
            ctx.restore();
        } else if (murCibleEdition) {
            ctx.save();
            ctx.strokeStyle = "#FFF200"; ctx.lineWidth = 5;
            ctx.strokeRect(murCibleEdition.x - 2, murCibleEdition.y - HAUTEUR_MUR - 2, murCibleEdition.w + 4, murCibleEdition.h + HAUTEUR_MUR + 4);
            ctx.restore();
        }
    }

    // 2. Séparer les meubles selon leur position par rapport aux murs
    // Un meuble passe DERRIÈRE un mur uniquement si le bas du meuble dépasse sous le bas du mur
    let meublesAuSol = meublesPlaces.filter(m => !estUneFenetre(m));

    // TRI PAR PROFONDEUR DE TOUS LES ÉLÉMENTS (MURS ET MEUBLES)
    let mursTries = [...murs].sort((a, b) => {
        let basA = a.y + a.h;
        let basB = b.y + b.h;

        if (Math.abs(basA - basB) < 2) {
            let isAHorizontal = a.w > a.h;
            let isBHorizontal = b.w > b.h;
            if (isAHorizontal && !isBHorizontal) return 1;
            if (!isAHorizontal && isBHorizontal) return -1;
        }

        return basA - basB;
    });

    // 3. Dessiner les éléments dans le bon ordre de profondeur
    mursTries.forEach(m => {
        let basDuMur = m.y + m.h;

        // A) Dessiner d'abord les meubles dont le bas est DERRIÈRE / AU-DESSUS de la ligne de ce mur
        meublesAuSol.forEach(meuble => {
            if (!meuble._dessine) {
                let basDuMeuble = meuble.y + (meuble.h * (meuble.scale || 1)) / 2;
                if (basDuMeuble <= basDuMur) {
                    dessinerUnMeuble(meuble);
                    meuble._dessine = true;
                }
            }
        });

        // B) Dessiner le mur (façade, tranche et ses fenêtres)
        dessinerMur(m);
    });

    // C) Dessiner les meubles restants (qui se trouvent devant TOUS les murs)
    meublesAuSol.forEach(meuble => {
        if (!meuble._dessine) {
            dessinerUnMeuble(meuble);
        }
        delete meuble._dessine; // Réinitialiser le drapeau pour la prochaine frame
    });

    // 4. Meuble ou Fenêtre en cours de placement dans la main (Éditeur)
    if (meubleEnModePlacement) {
        let curW = Math.round(meubleEnModePlacement.w * meubleEnModePlacement.scale);
        let curH = Math.round(meubleEnModePlacement.h * meubleEnModePlacement.scale);

        ctx.save();
        ctx.translate(Math.round(curseurMouse.x), Math.round(curseurMouse.y));
        ctx.rotate(meubleEnModePlacement.rotation * Math.PI / 180);
        ctx.globalAlpha = 0.9;

        let img = chargerImage(meubleEnModePlacement.url);
        if (img && img.complete && img.naturalWidth !== 0) {
            ctx.drawImage(img, -curW / 2, -curH / 2, curW, curH);
        } else {
            ctx.fillStyle = "#10D010"; 
            ctx.fillRect(-curW / 2, -curH / 2, curW, curH);
        }

        ctx.strokeStyle = "#FFF200"; 
        ctx.lineWidth = 3;
        ctx.strokeRect(-curW / 2, -curH / 2, curW, curH);
        ctx.restore();
    }
}

// FONCTION AUXILIAIRE POUR LE RENDU D'UN MEUBLE
function dessinerUnMeuble(m) {
    let img = chargerImage(m.url);
    let curW = Math.round(m.w * (m.scale || 1));
    let curH = Math.round(m.h * (m.scale || 1));

    ctx.save();
    ctx.translate(Math.round(m.x), Math.round(m.y));
    ctx.rotate((m.rotation || 0) * Math.PI / 180);

    if (img && img.complete && img.naturalWidth !== 0) {
        ctx.drawImage(img, -curW / 2, -curH / 2, curW, curH);
    } else {
        ctx.fillStyle = "#ff7043"; 
        ctx.fillRect(-curW / 2, -curH / 2, curW, curH);
    }
    ctx.restore();
}

function dessinerPersonnage(p, name, isOther = false) {
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y));

    let skinActif = p.skin || (p === player ? skinEquipe : null);

    if (skinActif) {
        let frameIndex = p.moving ? (Math.floor(p.animTimer / 10) % 3) + 1 : 1;
        
        let dirKeyword = "Face";
        if (p.dir === 'up') dirKeyword = "Back";
        else if (p.dir === 'down') dirKeyword = "Face";
        else if (p.dir === 'left') dirKeyword = "Gauche";
        else if (p.dir === 'right') dirKeyword = "Droite";

        let spriteFileName = `${skinActif}${dirKeyword}${frameIndex}.png`;
        let spriteUrl = `${ASSETS_BASE_URL}skins/${skinActif}/${spriteFileName}`;
        let imgSkin = chargerImage(spriteUrl);

        if (imgSkin && imgSkin.complete && imgSkin.naturalWidth !== 0) {
            let BASE_W = 50;
            let BASE_H = 80;

            let ratio = imgSkin.naturalWidth / imgSkin.naturalHeight;
            let drawW = BASE_W;
            let drawH = BASE_H;

            if (ratio > (BASE_W / BASE_H)) {
                drawH = BASE_W / ratio;
            } else {
                drawW = BASE_H * ratio;
            }

            drawW = Math.round(drawW);
            drawH = Math.round(drawH);

            ctx.drawImage(imgSkin, -drawW / 2, -drawH / 2, drawW, drawH);
        } else {
            dessinerPersonnageVectoriel(p);
        }
    } else {
        dessinerPersonnageVectoriel(p);
    }

    ctx.restore();

    if (isOther && p.actionEnCours && p.interactionType) {
        let icone = "💬";
        if (p.interactionType === 'manger') icone = "🍳";
        else if (p.interactionType === 'dormir') icone = "💤";
        else if (p.interactionType === 'toilette') icone = "🚽";
        else if (p.interactionType === 'douche') icone = "🚿";

        ctx.fillStyle = "#FFF200";
        ctx.font = "bold 14px Montserrat";
        ctx.textAlign = "center";
        ctx.fillText(icone, Math.round(p.x), Math.round(p.y) - 52);
    }

    ctx.fillStyle = "#000"; ctx.font = "bold 10px Montserrat"; ctx.textAlign = "center";
    ctx.fillText(name.toUpperCase(), Math.round(p.x), Math.round(p.y) - 38);
}

function dessinerPersonnageVectoriel(p) {
    let bounceY = p.moving ? Math.sin(p.animTimer * 0.2) * 3 : 0;
    ctx.beginPath(); ctx.ellipse(0, 16, 14, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fill();

    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.roundRect(-10, -10 + bounceY, 20, 22, 5); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "#000"; ctx.stroke();

    ctx.beginPath(); ctx.arc(0, -16 + bounceY, 10, 0, Math.PI * 2);
    ctx.fillStyle = "#ffdbac"; ctx.fill(); ctx.stroke();
}

let lastTime = performance.now();
let lastSendTime = 0;

function gameLoop(time) {
    let deltaTime = (time - lastTime) / 1000;
    lastTime = time;

    player.moving = false;
    let dx = 0, dy = 0;

    if (joystickActive && !actionEnCours && !meubleEnModePlacement && !isDraggingMeuble) {
        dx = joystickVector.x;
        dy = joystickVector.y;
    }

    if (dx !== 0 || dy !== 0) {
        if (actionEnCours) quitterAction();

        player.moving = true;
        player.animTimer++;

        if (Math.abs(dx) > Math.abs(dy)) {
            player.dir = dx > 0 ? 'right' : 'left';
        } else {
            player.dir = dy > 0 ? 'down' : 'up';
        }

        let moveStep = player.speed;

        let nextX = player.x + dx * moveStep;
        let nextY = player.y + dy * moveStep;

        if (!checkCollision(nextX, player.y)) player.x = nextX;
        if (!checkCollision(player.x, nextY)) player.y = nextY;
    } else {
        player.animTimer = 0;
    }

    degraderBesoins(deltaTime);
    detecterInteractions();
    gererProgressionAction(time);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(Math.round(canvas.width / 2 - player.x), Math.round(canvas.height / 2 - player.y));

    dessinerAppartement();

    Object.keys(otherPlayers).forEach(id => {
        let op = otherPlayers[id];
        if (op.moving) op.animTimer = (op.animTimer || 0) + 1;
        dessinerPersonnage(op, op.username, true);
    });

    if (currentUser) {
        dessinerPersonnage(player, currentUser, false);
    }

    ctx.restore();

    if (time > lastSendTime + 40) {
        let payload = {
            type: 'POS_UPDATE',
            username: currentUser,
            x: Math.round(player.x),
            y: Math.round(player.y),
            color: player.color,
            skin: skinEquipe,
            dir: player.dir,
            moving: player.moving,
            actionEnCours: actionEnCours,
            interactionType: interactionActive,
            peerId: myPeer ? myPeer.id : null
        };

        envoyerDonneesMulti(payload);
        lastSendTime = time;
    }

    requestAnimationFrame(gameLoop);
}
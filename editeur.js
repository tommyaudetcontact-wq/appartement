// ==========================================
// MODULE ÉDITEUR (Boutique, Achats & Synchro Argent)
// ==========================================

let modeEditeur = false;
let shopModalInst = null;
let meubleEnModePlacement = null;
let texturePlancherSelectionnee = null;
let pieceCibleEdition = null;

let permissionEditionInvite = false;

// Variables pour le solde et les achats
let argentJoueur = 0;
let itemsDebloques = [];

function peutEditer() {
    return isHost || permissionEditionInvite;
}

function basculerModeEditeur() {
    if (!peutEditer()) {
        alert("🔒 Seul le propriétaire de l'appartement peut modifier la décoration !");
        return;
    }

    modeEditeur = !modeEditeur;
    const btn = document.getElementById('btnToggleEditor');
    const panelControls = document.getElementById('editor-controls-hud');

    if (modeEditeur) {
        btn.innerText = "🎮 JOUER";
        btn.className = "btn brawl-btn btn-green";
    } else {
        btn.innerText = "🛠️ ÉDITEUR";
        btn.className = "btn brawl-btn btn-yellow";
        meubleEnModePlacement = null;
        fermerEditeurSol();
        if (panelControls) panelControls.style.display = 'none';
    }
}

function basculerPermissionInvite() {
    if (!isHost) return;
    permissionEditionInvite = !permissionEditionInvite;

    const btn = document.getElementById('btnTogglePermission');
    if (permissionEditionInvite) {
        btn.innerText = "🔓 PERMIS : OUI";
        btn.className = "btn brawl-btn btn-green";
    } else {
        btn.innerText = "🔒 PERMIS : NON";
        btn.className = "btn brawl-btn btn-pink";
    }

    envoyerDonneesMulti({
        type: 'PERMISSION_UPDATE',
        allowed: permissionEditionInvite
    });
}

function ouvrirBoutique() {
    if (!peutEditer()) {
        alert("🔒 L'hôte n'a pas autorisé la modification de l'appartement.");
        return;
    }
    if (!modeEditeur) basculerModeEditeur();
    
    // Rafraîchir les données bancaires avant d'ouvrir la fenêtre
    rafraichirDonneesJoueur().then(() => {
        if (!shopModalInst) shopModalInst = new bootstrap.Modal(document.getElementById('shopModal'));
        shopModalInst.show();
    });
}

// Récupère l'argent et la liste des meubles débloqués
function rafraichirDonneesJoueur() {
    if (!currentUser || typeof APPS_SCRIPT_WEBAPP_URL === 'undefined' || !APPS_SCRIPT_WEBAPP_URL) {
        return Promise.resolve();
    }

    let url = `${APPS_SCRIPT_WEBAPP_URL}?action=getArgentEtAchats&username=${encodeURIComponent(currentUser)}`;

    return fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data && data.success) {
                argentJoueur = parseFloat(data.argent) || 0;
                if (data.achats && Array.isArray(data.achats)) {
                    itemsDebloques = data.achats;
                }
                misaJourAffichageArgent();
            }
        })
        .catch(err => console.error("⚠️ Erreur récupération argent :", err));
}

function misaJourAffichageArgent() {
    const el = document.getElementById('shopUserMoney');
    if (el) el.innerText = `${argentJoueur.toFixed(2)} $`;
}

// FORCER TOUS LES ARTICLES À 2.00 $
function extrairePrixEtNom(fileName) {
    // Nettoie le nom de fichier (enlève le $2 initial si présent et l'extension .png/.jpg)
    let nomSansExtension = fileName.replace(/\.[^/.]+$/, "");
    let nomPropre = nomSansExtension.replace(/^\$[\d\.]+\s*/, "");

    return {
        prix: 2.0, // Tout coûte 2$
        nomPropre: nomPropre
    };
}

function chargerDossierGitHub(nomDossier) {
    let container = document.getElementById('shopContainer');
    container.innerHTML = `<div class="col-12 text-warning py-4 fw-bold fs-5">⏳ Chargement des articles...</div>`;

    let urlApiGithub = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_SPRITES}/contents/${nomDossier}`;

    fetch(urlApiGithub)
        .then(res => res.json())
        .then(fichiers => {
            container.innerHTML = "";
            if (!Array.isArray(fichiers)) {
                container.innerHTML = `<div class="col-12 text-muted py-4">Aucun contenu trouvé.</div>`;
                return;
            }

            let images = fichiers.filter(f => f.name.match(/\.(png|jpe?g)$/i));

            images.forEach(f => {
                let imgPagesUrl = `${ASSETS_BASE_URL}${nomDossier}/${f.name}`;
                let info = extrairePrixEtNom(f.name);
                let estAchete = info.prix === 0 || itemsDebloques.includes(f.name);

                let cardClass = estAchete ? 'meuble-card' : 'meuble-card item-locked';
                let actionBtn = '';

                if (estAchete) {
                    let label = nomDossier === 'plancher' ? 'ÉDITER 🪵' : 'PLACER 🛋️';
                    let btnColor = nomDossier === 'plancher' ? 'btn-blue' : 'btn-yellow';
                    actionBtn = `<button class="btn brawl-btn ${btnColor} btn-lg w-100 mt-2" onclick="selectionnerItem('${imgPagesUrl}', '${f.name}', '${nomDossier}')">${label}</button>`;
                } else {
                    let canAfford = argentJoueur >= info.prix;
                    let btnClass = canAfford ? 'btn-green' : 'btn-pink disabled';
                    actionBtn = `<button class="btn brawl-btn ${btnClass} btn-lg w-100 mt-2" onclick="acheterEtPlacer('${imgPagesUrl}', '${f.name}', '${nomDossier}', ${info.prix})">ACHETER 🛒 (${info.prix} $)</button>`;
                }

                container.innerHTML += `
                    <div class="col">
                        <div class="${cardClass}">
                            ${!estAchete ? `<div class="lock-badge">🔒 ${info.prix} $</div>` : ''}
                            <img src="${imgPagesUrl}" class="meuble-img-preview">
                            <div class="fw-bold text-white text-truncate fs-6">${info.nomPropre}</div>
                            ${actionBtn}
                        </div>
                    </div>`;
            });
        })
        .catch(err => {
            container.innerHTML = `<div class="col-12 text-danger py-4">⚠️ Erreur de chargement.</div>`;
        });
}

function acheterEtPlacer(urlImage, fileName, dossier, prix) {
    if (argentJoueur < prix) {
        alert("💵 Pas assez d'argent pour acheter cet objet !");
        return;
    }

    let payload = {
        action: 'acheterItem',
        username: currentUser,
        itemName: fileName,
        prix: prix
    };

    fetch(APPS_SCRIPT_WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            argentJoueur = data.argent;
            itemsDebloques = data.achats || [];
            misaJourAffichageArgent();
            selectionnerItem(urlImage, fileName, dossier);
        } else {
            alert("⚠️ " + (data.error || "Erreur lors de l'achat."));
        }
    })
    .catch(err => alert("⚠️ Erreur réseau lors de l'achat."));
}

function selectionnerItem(urlImage, nom, dossier) {
    if (dossier === 'plancher') {
        texturePlancherSelectionnee = urlImage;
        pieceCibleEdition = null;
        document.getElementById('editor-preview-img').src = urlImage;
        document.getElementById('editor-target-name').innerText = "Pièce : Cliquez sur une pièce";
        document.getElementById('editor-panel').style.display = 'block';
        document.getElementById('editor-controls-hud').style.display = 'none';
        mettreAJourAperçuSlider();
    } else {
        let testImg = new Image();
        testImg.crossOrigin = "Anonymous";
        testImg.onload = function() {
            let maxDim = 100;
            let ratio = testImg.naturalWidth / testImg.naturalHeight;
            let w = maxDim;
            let h = maxDim;

            if (ratio > 1) {
                h = maxDim / ratio;
            } else {
                w = maxDim * ratio;
            }

            meubleEnModePlacement = {
                id: Date.now() + "_" + Math.random().toString(36).substr(2, 4),
                type: dossier,
                url: urlImage, 
                nom: nom,
                w: w, 
                h: h,
                aspectRatio: ratio,
                scale: 1.0, 
                rotation: 0,
                isExisting: false
            };

            curseurMouse.x = player.x;
            curseurMouse.y = player.y;

            afficherControlesPlacement();
        };
        testImg.src = urlImage;
    }

    if (shopModalInst) shopModalInst.hide();
}

function afficherControlesPlacement() {
    const panel = document.getElementById('editor-controls-hud');
    if (panel) panel.style.display = 'flex';
}

function cacherControlesPlacement() {
    const panel = document.getElementById('editor-controls-hud');
    if (panel) panel.style.display = 'none';
}

function ajusterTailleMeuble(delta) {
    if (!meubleEnModePlacement) return;
    meubleEnModePlacement.scale = Math.max(0.2, Math.min(4.0, meubleEnModePlacement.scale + delta));
}

function tournerMeuble() {
    if (!meubleEnModePlacement) return;
    meubleEnModePlacement.rotation = (meubleEnModePlacement.rotation + 45) % 360;
}

function validerPlacementMeuble() {
    if (!meubleEnModePlacement) return;

    let finalW = meubleEnModePlacement.w * meubleEnModePlacement.scale;
    let finalH = meubleEnModePlacement.h * meubleEnModePlacement.scale;

    let meubleAEnregistrer = {
        id: meubleEnModePlacement.id || (Date.now() + "_" + Math.random().toString(36).substr(2, 4)),
        type: meubleEnModePlacement.type,
        x: curseurMouse.x, 
        y: curseurMouse.y,
        w: finalW, 
        h: finalH,
        baseW: meubleEnModePlacement.w,
        baseH: meubleEnModePlacement.h,
        aspectRatio: meubleEnModePlacement.aspectRatio,
        url: meubleEnModePlacement.url,
        nom: meubleEnModePlacement.nom,
        scale: 1.0,
        rotation: meubleEnModePlacement.rotation
    };

    if (meubleEnModePlacement.isExisting) {
        let index = meublesPlaces.findIndex(m => m.id === meubleEnModePlacement.id);
        if (index !== -1) meublesPlaces[index] = meubleAEnregistrer;
        else meublesPlaces.push(meubleAEnregistrer);
        
        meubleEnModePlacement = null;
        cacherControlesPlacement();
    } else {
        meublesPlaces.push(meubleAEnregistrer);

        meubleEnModePlacement = {
            id: Date.now() + "_" + Math.random().toString(36).substr(2, 4),
            type: meubleAEnregistrer.type,
            url: meubleAEnregistrer.url,
            nom: meubleAEnregistrer.nom,
            w: meubleAEnregistrer.baseW,
            h: meubleAEnregistrer.baseH,
            aspectRatio: meubleAEnregistrer.aspectRatio,
            scale: meubleEnModePlacement.scale,
            rotation: meubleEnModePlacement.rotation,
            isExisting: false
        };
    }

    envoyerDonneesMulti({ type: 'MEUBLE_UPDATE_ALL', meubles: meublesPlaces });
    sauvegarderAppartementDansSheet();
}

function supprimerMeubleActif() {
    if (!meubleEnModePlacement) return;

    if (meubleEnModePlacement.isExisting) {
        meublesPlaces = meublesPlaces.filter(m => m.id !== meubleEnModePlacement.id);
        envoyerDonneesMulti({ type: 'MEUBLE_UPDATE_ALL', meubles: meublesPlaces });
        sauvegarderAppartementDansSheet();
    }

    meubleEnModePlacement = null;
    cacherControlesPlacement();
}

function verifierSelectionMeubleExistant(x, y) {
    if (!modeEditeur || meubleEnModePlacement || !peutEditer()) return false;

    for (let i = meublesPlaces.length - 1; i >= 0; i--) {
        let m = meublesPlaces[i];
        let halfW = (m.w * (m.scale || 1)) / 2;
        let halfH = (m.h * (m.scale || 1)) / 2;

        if (x >= m.x - halfW && x <= m.x + halfW && y >= m.y - halfH && y <= m.y + halfH) {
            meubleEnModePlacement = {
                id: m.id,
                type: m.type,
                url: m.url,
                nom: m.nom,
                w: m.baseW || m.w,
                h: m.baseH || m.h,
                aspectRatio: m.aspectRatio || (m.w / m.h),
                scale: m.scale || 1.0,
                rotation: m.rotation || 0,
                isExisting: true
            };

            curseurMouse.x = m.x;
            curseurMouse.y = m.y;

            afficherControlesPlacement();
            return true;
        }
    }
    return false;
}

function mettreAJourAperçuSlider() {
    let val = document.getElementById('tileSizeSlider').value;
    let sizePx = Math.round((val / 100) * 200);
    document.getElementById('sliderValueText').innerText = `${val}% (${sizePx}px)`;
}

function fermerEditeurSol() {
    texturePlancherSelectionnee = null;
    pieceCibleEdition = null;
    document.getElementById('editor-panel').style.display = 'none';
}

function appliquerPlancherFinal() {
    if (!texturePlancherSelectionnee) return;
    if (!pieceCibleEdition) {
        alert("Cliquez sur une pièce pour appliquer le sol !");
        return;
    }

    let sliderVal = parseFloat(document.getElementById('tileSizeSlider').value);
    let scaleRatio = sliderVal / 100.0;

    let textData = {
        url: texturePlancherSelectionnee,
        scale: scaleRatio
    };

    planchersPieces[pieceCibleEdition.id] = textData;

    envoyerDonneesMulti({ 
        type: 'PLANCHER_UPDATE', 
        pieceId: pieceCibleEdition.id, 
        texture: textData 
    });

    sauvegarderAppartementDansSheet();
    fermerEditeurSol();
}

function sauvegarderAppartementDansSheet() {
    if (!currentUser || typeof APPS_SCRIPT_WEBAPP_URL === 'undefined' || !APPS_SCRIPT_WEBAPP_URL) return;

    let payload = {
        action: 'sauvegarderAppartement',
        username: currentUser,
        meubles: meublesPlaces,
        planchers: planchersPieces
    };

    fetch(APPS_SCRIPT_WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) console.log("✅ Appartement sauvegardé !");
    })
    .catch(err => console.error("⚠️ Erreur sauvegarde :", err));
}

function chargerAppartementDepuisSheet() {
    if (!currentUser || typeof APPS_SCRIPT_WEBAPP_URL === 'undefined' || !APPS_SCRIPT_WEBAPP_URL) return;

    // Charger l'argent et les achats immédiatement au démarrage
    rafraichirDonneesJoueur();

    let url = `${APPS_SCRIPT_WEBAPP_URL}?action=chargerAppartement&username=${encodeURIComponent(currentUser)}`;

    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                if (data.meubles && Array.isArray(data.meubles)) meublesPlaces = data.meubles;
                if (data.planchers && typeof data.planchers === 'object') planchersPieces = data.planchers;
                if (data.achats && Array.isArray(data.achats)) itemsDebloques = data.achats;
                console.log("✅ Appartement et compte chargés !");
            }
        })
        .catch(err => console.error("⚠️ Erreur chargement :", err));
}
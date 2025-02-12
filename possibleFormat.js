// Initialisiere die Karte
const map = L.map('map').setView([50.78336441336823, 6.07426976411723], 14); // Startposition: Koordinaten von Köln

// OSM Tile Layer hinzufügen
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Marker für das Auto
let carMarker = null;
let streetLayer = null; // für die Straßenmarkierung
let legendDiv = document.createElement('div'); // Legende für Infos
legendDiv.id = 'legend';
//document.body.appendChild(legendDiv);
legendDiv.style.position = "absolute";
legendDiv.style.bottom = "10px";  // Setzt die Legende nach unten
legendDiv.style.left = "10px";    // Setzt sie nach links
legendDiv.style.padding = "10px";
legendDiv.style.backgroundColor = "white";
legendDiv.style.borderRadius = "5px";
legendDiv.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.2)";
legendDiv.style.maxHeight = "300px";
legendDiv.style.overflowY = "auto";  // Scrollbar hinzufügen, wenn zu viel Text
legendDiv.style.zIndex = 1000;

// Klick-Event für Straßenabfrage
map.on('click', async function (e) {
    const { lat, lng } = e.latlng;
    console.log(`Klick auf Karte bei: Lat: ${lat}, Lng: ${lng}`); // Debugging Ausgabe

    // Overpass API-Abfrage für Parkinformationen
    const overpassQuery = `
        [out:json];
        (
          way(around:5,${lat},${lng})["highway"];
          node(around:5,${lat},${lng})["highway"];
        );
        out body tags geom;
    `;
    console.log(`Übergebe folgende Abfrage an Overpass API:\n${overpassQuery}`); // Debugging Ausgabe
    
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
    try {
        const response = await fetch(url);
        console.log("API Antwort erhalten"); // Debugging Ausgabe

        if (!response.ok) {
            console.error("Fehler bei der API-Abfrage:", response.status, response.statusText);
            return;
        }

        const data = await response.json();
        console.log("Daten von API erhalten:", data); // Debugging Ausgabe

        if (data.elements.length === 0) {
            console.log("Keine Elemente gefunden."); // Debugging Ausgabe
            document.getElementById('info').innerText = `🚫 Keine Parkinformationen gefunden.`;
            return;
        }

        // Finde die nächstgelegene Straße (Way)
        const closestWay = data.elements.find(el => el.type === 'way' && el.tags['highway']);
        console.log("Gefundene Straße:", closestWay); // Debugging Ausgabe

        if (!closestWay) {
            console.log("Keine Straße  gefunden."); // Debugging Ausgabe
            document.getElementById('info').innerText = `🚫 Keine Straße gefunden.`;
            return;
        }

        // Lösche vorherige Straßenmarkierung
        if (streetLayer) {
            map.removeLayer(streetLayer);
        }

        // Zeichne die Straße auf der Karte
        const wayCoords = closestWay.geometry.map(coord => [coord.lat, coord.lon]);
        console.log
        streetLayer = L.polyline(wayCoords, {
            color: 'blue',
            weight: 4,
            opacity: 0.7
        }).addTo(map);

        // Bestimme den nächsten Punkt auf der Straße (snapping)
        const line = turf.lineString(wayCoords);
        const point = turf.point([lat, lng]);
        const nearest = turf.nearestPointOnLine(line, point);
        const closestPoint = { lat: nearest.geometry.coordinates[0], lng: nearest.geometry.coordinates[1] }; 

        console.log(closestPoint.lat)
        // Setze Marker auf den nächsten Punkt
        if (carMarker) {
            carMarker.setLatLng([closestPoint.lat, closestPoint.lng]);
        } else {
            carMarker = L.marker([closestPoint.lat, closestPoint.lng]).addTo(map);
        }

        // Anzeigen der relevanten Parkinformationen für die Straße
        let infoText = `🚗 Parkinformationen für Straße:\n`;

        const tags = closestWay.tags;
        console.log("closestWay.tags: ", tags)

        if (tags['parking']) {
            infoText += `✔ Parken erlaubt: ${tags['parking']}\n`;
        }
        if (tags['maxstay']) {
            infoText += `🕒 Maximale Parkdauer: ${tags['maxstay']}\n`;
        }
        if (tags['fee']) {
            infoText += `💰 Gebühr: ${tags['fee'] === 'yes' ? 'Ja' : 'Nein'}\n`;
        }
        if (tags['parking:condition']) {
            infoText += `⏳ Einschränkungen: ${tags['parking:condition']}\n`;
        }
        if (tags['payment:method']) {
            infoText += `💳 Zahlungsmethoden: ${tags['payment:method']}\n`;
        }
        if (tags['restriction']) {
            infoText += `🚫 Einschränkungen: ${tags['restriction']}\n`;
        }
        if (tags['parking:meter']) {
            infoText += `🅿️ Parkuhr vorhanden: ${tags['parking:meter'] === 'yes' ? 'Ja' : 'Nein'}\n`;
        }
        if (tags['parking:wheelchair']) {
            infoText += `♿ Behindertenparkplatz: ${tags['parking:wheelchair'] === 'yes' ? 'Ja' : 'Nein'}\n`;
        }

        // Füge alle relevanten Node-Infos (Parkautomaten, Einzelparkplätze) hinzu
        const relevantNodes = data.elements.filter(el => el.type === 'node' && el.tags['parking']);
        console.log("Gefundene Nodes:", relevantNodes); // Debugging Ausgabe
        relevantNodes.forEach(node => {
            L.marker([node.lat, node.lon]).addTo(map).bindPopup(`Parkplatz: ${node.tags['parking']}`);
            infoText += `📍 Einzelner Parkplatz: ${node.tags['parking']}\n`;
        });

        // Zeige die Parkinfos an
        document.getElementById('info').innerText = infoText;

        // Update die Legende
        updateLegend(infoText);

    } catch (error) {
        console.error("Fehler bei der Abfrage:", error);
        document.getElementById('info').innerText = "🚫 Fehler bei der Abfrage.";
    }
});

// Funktion zur Aktualisierung der Legende mit den Park-Infos
function updateLegend(infoText) {
    legendDiv.innerHTML = `
        <h3>Parkinformationen:</h3>
        <pre>${infoText}</pre>
    `;
}
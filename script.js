// initialize map
const map = L.map('map').setView([49.270, 8.955], 8); 

// OSM tile layer 
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// auto marker
let carMarker = null;
let streetLayer = null; // für die Straßenmarkierung

//legende: altes konzept aber wird vll nochmal gebraucht
let legendDiv = document.createElement('div'); 
legendDiv.id = 'legend';
//document.body.appendChild(legendDiv);
legendDiv.style.position = "absolute";
legendDiv.style.bottom = "10px";  // legende nach unten
legendDiv.style.left = "10px";    // legende nach links
legendDiv.style.padding = "10px";
legendDiv.style.backgroundColor = "white";
legendDiv.style.borderRadius = "5px";
legendDiv.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.2)";
legendDiv.style.maxHeight = "300px";
legendDiv.style.overflowY = "auto";  // scrollbar 
legendDiv.style.zIndex = 1000;

// abort wenn user wie wild rumklicken
let isRequestInProgress = false;

// main funktion die beim klicken auf die Karte ausgeführt wird
map.on('click', async function (e) {
    if (isRequestInProgress) {
        console.log("Request already in progress. Aborting new request.");
        return; //schnell raus
    }

    isRequestInProgress = true; // s geht los

    const { lat, lng } = e.latlng;
    console.log(`map klick bei: lat: ${lat}, lng: ${lng}`); // debugging 

    // overpass query!!!
    const overpassQuery = `
        [out:json];
        (
          way[highway~"trunk|primary|secondary|tertiary|unclassified|residential"](around:30,${lat},${lng});
          node(around:100,${lat},${lng})["highway"];
        );
        out body tags geom;
    `;
    console.log(`overpass query:\n${overpassQuery}`); // debugging
    
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
    try {
        const response = await fetch(url);
        console.log("\"et an api telefoniert\""); // debugging

        if (!response.ok) {
            console.error("api broken", response.status, response.statusText);
            return;
        }

        const data = await response.json();
        console.log("daten sind da, im richtigen format und nix kaputt", data); // debugging 

        if (data.elements.length === 0) {
            console.log("keine Elemente."); // debugging
            document.getElementById('info').innerText = `🚫 Hier ist nix lol`;
            return;
        }

        // Find all the ways (roads)
        const ways = data.elements.filter(el => el.type === 'way' && el.tags['highway']);

        // Find the closest point on each way
        const closestPoints = ways.map(w => {
            const line = turf.lineString(w.geometry.map(coord => [coord.lon, coord.lat])); // Convert coords to [lon, lat]
            const point = turf.point([lng, lat]); // Create point with [lng, lat]
            const nearest = turf.nearestPointOnLine(line, point); // Find the nearest point on the line
            return { 
                way: w, 
                lat: nearest.geometry.coordinates[1],  // Latitude
                lng: nearest.geometry.coordinates[0]   // Longitude
            };
        });

        // Find the closest way by comparing the distance to each point
        const point = turf.point([lng, lat]);
        const closestWayData = closestPoints.reduce((closest, current) => {
            const currentDistance = turf.distance(point, turf.point([current.lng, current.lat]));
            if (!closest || currentDistance < closest.distance) {
                return { closestPointOnWay: current, distance: currentDistance };
            }
            return closest;
        }, null);

        const { closestPointOnWay, distance } = closestWayData || null;
        const closestWay = closestPointOnWay.way || null;
        const closestPoint = {lat: closestPointOnWay.lat, lng: closestPointOnWay.lng} || null

        console.log("nächste Straße:", closestPointOnWay.way); // debugging 

        if (!closestWay) {
            console.log("keine Staße gefunden."); // debugging 
            document.getElementById('info').innerText = `🚫 Keine Straße gefunden`;
            return;
        }

        // lösche vorherige straßenmarkierung
        if (streetLayer) {
            map.removeLayer(streetLayer);
        }

        // draw street
        const wayCoords = closestWay.geometry.map(coord => [coord.lat, coord.lon]);
        console.log
        streetLayer = L.polyline(wayCoords, {
            color: 'blue',
            weight: 4,
            opacity: 0.7
        }).addTo(map);

        console.log("closest point on map:", closestPoint)
        
        // marker auf nächsten Punkt auf der Straße
        if (carMarker) {
            carMarker.setLatLng([closestPoint.lat, closestPoint.lng]);
        } else {
            carMarker = L.marker([closestPoint.lat, closestPoint.lng]).addTo(map);
        }

        const tags = closestWay.tags;
        console.log("closestWay.tags: ", tags)

        // headline für Straßen-Infos
        let infoText = `<b>${tags["name"]}</b>\n`;

        //filter all parking keys
        const sides = ["both", "left", "right"];
        
        // regex für die ´parking´ tags
        const parkingRegex = new RegExp(`^parking(:(${sides.join('|')}):)?`);

        const parkingTags = Object.keys(tags).filter(el => parkingRegex.test(el))

        if(parkingTags.length == 0){
            infoText += `Leider gibbet hier keine Infos`;
        }
        else {
            parkingTags.forEach( t => {
                infoText += `- ${t} -> ${tags[t]}\n`;
            });
        }
    

        // node infos, POI wie Parkautomaten etc (actually noch nie was gefunden)
        const relevantNodes = data.elements.filter(el => el.type === 'node' && el.tags['parking']);
        console.log("Gefundene Nodes:", relevantNodes); // debugging
        relevantNodes.forEach(node => {
            L.marker([node.lat, node.lon]).addTo(map).bindPopup(`Parkplatz: ${node.tags['parking']}`);
            infoText += `📍 Einzelner Parkplatz: ${node.tags['parking']}\n`;
        });

        // show infos
        document.getElementById('info').innerText = infoText;
        updateInfo(infoText);

    } catch (error) {
        console.error("irgendwat ist falsch gelaufen -> 99/100 mal syntax error:", error);
        document.getElementById('info').innerText = "🚫 Fehler bei der Abfrage.";
    }finally {
        // so jetzt kann wieder
        isRequestInProgress = false;
    }
});

// updadte parking info
function updateInfo(infoText) {
    document.getElementById("info").innerHTML = `
        <h3 style="margin-top: 10px">Parkinformationen:</h3>
        <pre>${infoText}</pre>
    `;
}

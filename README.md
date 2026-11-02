# monster-peitsche-

## Automatische Angebotsaktualisierung

GitHub Actions ruft jeden Montag um 05:00 UTC die strukturierten Monster-Angebote von MeinProspekt ab und aktualisiert `Neuer Ordner/latest-offers.js`. Händlerpreise werden einzeln mit ihrem Ablaufdatum übernommen. Nach dem ersten Push der Workflow-Datei startet der Scan außerdem einmalig; ein manueller Lauf ist über **Actions → Update Monster offers → Run workflow** möglich.

Die Website wird über GitHub Pages veröffentlicht: https://ltschmitt4-crypto.github.io/monster-peitsche-/ . Der Workflow veröffentlicht Änderungen aus `Neuer Ordner/` automatisch nach Pushes auf `main`.

Die Startseite fragt die Datendatei zusätzlich alle 60 Sekunden ab. Die Angebotsübersicht ist bundesweit und bestätigt keine Verfügbarkeit in einzelnen Filialen; prüfe daher den jeweiligen Prospekt.

Die PLZ-Suche ermittelt Filialen im Umkreis von 15 km über OpenStreetMap und ordnet ihnen passende, aktuell erfasste Prospektangebote zu. Die PLZ wird dafür an OpenStreetMap übermittelt. Prospektpreise sind bundesweit und bestätigen weder den Filialpreis noch das Sortiment vor Ort; Ergebnisse können deshalb unvollständig sein.

Für einen lokalen Test kann der Scan mit `node "Neuer Ordner/update-offers.mjs"` gestartet werden. Ein erfolgreicher Lauf schreibt die aktuellen, zeitlich gültigen Angebotsdaten in die Datendatei.
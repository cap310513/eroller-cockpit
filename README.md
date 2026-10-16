# E-Roller Cockpit

Eine Web-App fürs iPhone (und Android): Tacho, Stufenregler (1–22), Nullstart-Schalter, eigene Farben, PIN-Sperre und ein Bluetooth-Scanner. Gedacht für den **Hitway H11**.

Kein Mac, kein App-Store, keine 99 € und keine Erneuerung alle 7 Tage: Die App läuft als Webseite und wird über **GitHub Pages** bereitgestellt.

## So installiert dein Freund sie (einmalig, 2 Minuten)

1. Im App Store den kostenlosen Browser **Bluefy** installieren (er kann als einziger iPhone-Browser Bluetooth aus Webseiten).
2. In Bluefy diesen Link öffnen: **https://cap310513.github.io/eroller-cockpit/**
3. Als Lesezeichen speichern, fertig. Updates kommen automatisch, sobald er die Seite öffnet.

> Safari geht **nicht**: Apple erlaubt dort kein Web Bluetooth.

## Was schon geht

| Funktion | Stand |
|---|---|
| Tacho mit **GPS-Geschwindigkeit** vom iPhone | fertig |
| Regler 1–22, Nullstart-Schalter, Stufe ± | fertig (wirkt auf den Roller erst nach Protokoll, siehe unten) |
| Farbthemen, eigene Farbe, Dunkel/Schwarz/Hell, mph/km/h | fertig |
| PIN-Sperre (eigene PIN, sperrt sich nach 30 s im Hintergrund) | fertig |
| Demo-Modus (simulierte Fahrt, zum Vorzeigen) | fertig |
| Bluetooth-Scanner: Services anzeigen, lesen, abonnieren, Bericht teilen | fertig |
| **Roller wirklich steuern + echte Geschwindigkeit vom Roller** | wartet auf das Bluetooth-Protokoll |

## Warum steuert die App den Roller noch nicht?

Hitway hat sein Bluetooth-Protokoll nicht veröffentlicht. Die App kann sich verbinden und mitlesen, **sendet aber absichtlich nichts** an den Roller, solange wir die Befehle nicht kennen. Blindes Senden könnte die Steuerung stören.

Den Weg zum Protokoll beschreibt [PROTOKOLL-ANLEITUNG.md](PROTOKOLL-ANLEITUNG.md).

## Hinweise

- **Die PIN ist ein Sichtschutz**, kein echter Schutz: Sie liegt als Hash nur auf dem Gerät. Wer das Handy entsperrt hat und sich auskennt, kann sie umgehen. Wer die PIN vergisst, kann die App-Daten zurücksetzen.
- **Straßenverkehr:** Der H11 ABE ist ab Werk auf 20 km/h und Anschieben (kein Nullstart) ausgelegt. Wer das über die App ändert, verliert im öffentlichen Straßenverkehr die Betriebserlaubnis und den Versicherungsschutz. Nur für Privatgelände.
- Die Tacho-Skala (Standard 30) und das Regler-Maximum (Standard 22) lassen sich in den Einstellungen ändern. Der Regler kann auch als km/h-Wert statt als Stufe beschriftet werden.

## Entwickeln (ohne Zusatzprogramme)

Reine HTML/CSS/JS-Dateien, kein Build-Schritt.

```bash
python -m http.server 8080
```

Dann `http://localhost:8080` öffnen. Web Bluetooth funktioniert auf `localhost` auch in Chrome/Edge am Windows-PC (Bluetooth-Adapter vorausgesetzt).

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css` | Oberfläche |
| `app.js` | Tacho, Regler, Bluetooth-Scanner, PIN, Einstellungen |
| `protocol.js` | **Hier kommt das Hitway-Protokoll rein** |
| `sw.js`, `manifest.webmanifest` | Offline-Cache, Installierbarkeit |
| `tools/make_icons.py` | erzeugt die PNG-Icons neu |
| `version.json` | aktuelle Versionsnummer: Die App lädt sich selbst neu, wenn sie älter ist |

**Neue Version veröffentlichen:** Die Nummer an fünf Stellen gleichzeitig erhöhen: `APP_VERSION` in `app.js`, die drei `?v=` in `index.html` und `version.json`. Dann committen und pushen. Danach holt sich jedes Handy die neue Version beim nächsten Öffnen automatisch, auch durch den GitHub-Zwischenspeicher hindurch.

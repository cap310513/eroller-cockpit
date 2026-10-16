# Das Bluetooth-Protokoll des Hitway H11 herausfinden

Ziel: wissen, **welche Bytes** der Roller für „Stufe 14", „Nullstart an" und „aktuelle Geschwindigkeit" verwendet. Dann tragen wir sie in `protocol.js` ein und setzen `confirmed: true`.

Bekannt: Es gibt eine offizielle **HITWAY-App** im App Store (verbindet per Bluetooth, zeigt Parameter, „weitere Einstellungen"). Sie ist unsere beste Quelle.

## Schritt 1: Der Roller soll sich zeigen (Freund, iPhone, 5 Minuten)

1. App **nRF Connect** (Nordic Semiconductor, kostenlos) installieren.
2. Roller einschalten, die HITWAY-App **komplett beenden** (sonst ist der Roller belegt).
3. In nRF Connect scannen, den Roller antippen → **Connect**.
4. Screenshots von **allen Services** schicken (aufklappen, UUIDs und die Merkmale „Read / Write / Notify" sichtbar).

## Schritt 2: Mit unserer App auslesen (Freund, iPhone, Bluefy)

1. Die Cockpit-App in **Bluefy** öffnen → Tab **Bluetooth** → **Suchen & verbinden** → Roller wählen.
2. Fehlen Services? Die UUIDs aus nRF Connect unter „Zusätzliche Service-UUIDs" eintragen und neu verbinden.
3. **Alle abonnieren** tippen, 20 Sekunden warten, dann den **Hebel am Roller bewegen / Stufe am Roller wechseln / fahren**.
4. **Bericht teilen** → an Jan schicken. Darin stehen die Services und alle empfangenen Daten.

## Schritt 3: Die Befehle der Original-App mitschneiden (am besten)

Reines Zuhören zeigt, was der Roller *sendet*. Was die HITWAY-App *befiehlt*, sieht man nur mit einem Mitschnitt. Das geht am einfachsten mit einem **Android-Handy** (auch ein altes, geliehenes):

1. Entwickleroptionen → **„Bluetooth-HCI-Snoop-Log aktivieren"**.
2. HITWAY-App installieren, mit dem Roller verbinden, **Einstellungen durchklicken** (Stufen, Modi, Zero-Start falls vorhanden).
3. Bluetooth aus/an, Fehlerbericht erstellen, die Datei `btsnoop_hci.log` schicken.
4. Auswertung mit Wireshark (Filter `btatt`), dort stehen alle Schreibbefehle im Klartext.

Alternative ohne Android: die `.ipa`/APK der HITWAY-App mit `jadx` zerlegen und nach den Befehls-Bytes suchen. Aufwendiger, aber machbar.

## Schritt 4: In die App einbauen

In `protocol.js` das Profil `hitway` ausfüllen (Beispiel steht als Kommentar drin):

- `attach(link)`: Benachrichtigungen abonnieren, Geschwindigkeit/Akku an `link.emit({ speed, battery })` melden
- `setLevel(link, level)` und `setZeroStart(link, on)`: die richtigen Bytes schreiben
- `confirmed: true`

Erst dann senden Regler und Schalter wirklich etwas an den Roller. Vorher bleiben sie reine Vorschau.

## Offene Fragen an den Freund

- Was soll „1–22" genau sein: **Stufen** oder **km/h-Limit**? (Einstellbar in der App unter „Regler bedeutet".)
- Meint er mit „0 Start" den **Nullstart (Anfahren ohne Anschieben)**? Laut Hersteller hat die ABE-Version den nicht. Ob der Regler das per Bluetooth freigibt, zeigt erst der Mitschnitt.
- Nennt die HITWAY-App bei ihm bereits Stufen oder Modi? Ein Screenshot der App-Einstellungen hilft enorm.

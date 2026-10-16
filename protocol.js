/*
 * Roller-Protokolle
 * -----------------
 * Hier steht, wie die App mit dem Roller "spricht". Das Hitway-Protokoll ist
 * öffentlich nicht dokumentiert, deshalb ist `confirmed` noch false: Die App
 * verbindet sich und liest mit, schickt dem Roller aber KEINE Steuerbefehle.
 *
 * Sobald wir die UUIDs und Befehle kennen (siehe PROTOKOLL-ANLEITUNG.md):
 *   1. services/write/notify eintragen
 *   2. setLevel, setZeroStart und parse ausfüllen
 *   3. confirmed auf true setzen
 *
 * `link` bietet:
 *   link.write(serviceUuid, charUuid, Uint8Array)   -> Promise
 *   link.read(serviceUuid, charUuid)                -> Promise<DataView>
 *   link.subscribe(serviceUuid, charUuid, cb)       -> Promise  (cb bekommt DataView)
 *   link.emit({ speed, battery, odometer })         -> Werte an den Tacho melden (speed in km/h)
 *   link.log(text)                                  -> ins Bluetooth-Protokoll schreiben
 */
window.ScooterProtocols = [
  {
    id: 'hitway',
    label: 'Hitway H11',
    confirmed: false,
    matches: (name) => /hitway|h11/i.test(name || ''),

    // Beispiel (noch nicht echt!):
    // services: { main: '0000ffe0-0000-1000-8000-00805f9b34fb' },
    // async attach(link) {
    //   await link.subscribe(this.services.main, '0000ffe1-0000-1000-8000-00805f9b34fb', (dv) => {
    //     link.emit({ speed: dv.getUint16(2, true) / 10, battery: dv.getUint8(4) });
    //   });
    // },
    // async setLevel(link, level)   { await link.write(svc, chr, new Uint8Array([0xA5, 0x01, level])); },
    // async setZeroStart(link, on)  { await link.write(svc, chr, new Uint8Array([0xA5, 0x02, on ? 1 : 0])); },

    async attach() {},
    async setLevel() {},
    async setZeroStart() {},
  },
];

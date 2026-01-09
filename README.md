# ioBroker SolisCloudV2V2 Adapter (soliscloudv2)

Dieser Adapter liest Daten aus der **SolisCloudV2 Platform API** und legt **alle Parameter** aus den API-Responses automatisch als ioBroker-States ab.
Er pollt Realtime-Daten in einem kurzen Intervall und lädt Stammdaten/Detaildaten seltener.

## Installation (lokal aus ZIP)

1. ZIP entpacken auf dem ioBroker-Host, z.B. nach `/opt/iobroker/iobroker.soliscloudv2`
2. In das Verzeichnis wechseln:
   ```bash
   cd /opt/iobroker/iobroker.soliscloudv2
   ```
3. Dependencies installieren:
   ```bash
   npm i --only=prod
   ```
4. Adapter installieren:
   ```bash
   iobroker add .
   ```
5. Im ioBroker Admin den Adapter konfigurieren (API ID/Secret) und starten.

> Hinweis: Das Paket enthält bereits die vorkompilierten Dateien unter `build/`.

## States

Die States werden aus dem JSON rekursiv geflattet angelegt, z.B.:

- `soliscloudv2.0.stations.<stationId>.stationDay.data.familyLoadPower`
- `soliscloudv2.0.inverters.<sn>.inverterDay.data.pvPower`

Units/Rollen werden heuristisch gesetzt (Power=W, Energy=kWh, Temp=°C, SOC=% usw.).

## Konfiguration

- Polling-Intervall (Realtime)
- Stammdaten-Intervall (Details/Listen)
- Optionale Filter auf Station IDs / Inverter SNs
- Auswahl, welche Endpunkte aktiv sind

## Support / Haftung

Dies ist ein Beispiel-Adapter. Nutzung auf eigenes Risiko.

# Minimalerei Bestseller Dashboard

Ein privates Dashboard zur Auswertung der Top-10-Produkte aus dem Minimalerei Shopify-Shop.

## Funktionen

- Top 10 Bestseller nach Zeitraum (Woche, Monat, Quartal, Jahr, Alle Zeiten + einzelne Monate)
- Aufklappbare Varianten-Aufschlüsselung pro Produkt
- Übersichtskacheln: Gesamtumsatz, Bestellungen, Ø Warenkorb, Top-10-Anteil
- Live-Daten direkt aus der Shopify Admin API

## Stack

- Frontend: Static HTML/CSS/JS (kein Build nötig)
- Backend: Cloudflare Pages Function
- Auth: Cloudflare Access (E-Mail-Login)

## Environment Variables

- `SHOPIFY_TOKEN` (Secret): Admin API Access Token (beginnt mit `atkn_`)
- `SHOPIFY_SHOP` (Plaintext): `minimalerei.myshopify.com`

## Deployment

Automatisch bei jedem Push auf main via Cloudflare Pages.

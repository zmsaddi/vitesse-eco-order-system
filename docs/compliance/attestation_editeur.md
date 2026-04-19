# Attestation d'Éditeur — Système Vitesse Eco

> **المرجع**: CGI art. 286-I-3° bis + BOI-TVA-DECLA-30-10-30 + loi 2015-1785 art. 88 (loi anti-fraude TVA 2018)
> **الـ 4 critères المطلوبة**: inaltérabilité + sécurisation + conservation + archivage
> **التاريخ**: يُوقَّع قبل go-live.

---

## Déclaration de l'Éditeur

Je soussigné(e), **[Nom et qualité]**, en ma qualité d'éditeur et de mainteneur du logiciel **"Vitesse Eco v2 — Système de gestion des commandes et opérations"**, déclare sur l'honneur que ce logiciel :

### 1. Inaltérabilité (Inalterability)

- **Soft-delete mandatory**: Aucune opération SQL DELETE n'est autorisée sur les tables financières (orders, order_items, deliveries, invoices, invoice_lines, payments, bonuses, settlements, treasury_movements, profit_distributions, cancellations, purchases, supplier_payments, expenses). `REVOKE DELETE` appliqué à niveau DB (D-04).
- **Immutability triggers**: Les tables `activity_log`, `cancellations`, `price_history`, `treasury_movements`, `invoice_lines` disposent de triggers PostgreSQL `BEFORE UPDATE` qui rejettent toute modification (D-58).
- **Hash chain**: Chaque facture (`invoices`) et chaque entrée audit (`activity_log`, `cancellations`) porte un `row_hash = SHA-256(prev_hash || canonical_data)` calculé par trigger avant INSERT. Toute modification post-factum briserait la chaîne et serait détectable (D-37).
- **Frozen snapshots**: Les lignes de facture (`invoice_lines`) et totaux (`total_ttc_frozen`, `total_ht_frozen`, `tva_amount_frozen`, `vat_rate_frozen`) sont gelés lors de l'émission — indépendants des changements ultérieurs dans les tables sources (D-30).

### 2. Sécurisation (Security)

- **Authentification**: Auth.js v5 avec JWT + Argon2id (paramètres m=64MB, t=3, p=4 — CNIL délibération 2022-100 + ANSSI 2023) (D-40).
- **Session**: Idle 30 minutes + absolute 8 hours + auto-logout (D-45).
- **Authorization**: DB-driven permissions avec `can(role, resource, action)` + PII masking pour non-PM/GM (D-37 + D-51).
- **Transport**: HTTPS (Vercel enforce automatique) + HSTS.
- **Isolation**: Role-based visibility avec row-level filtering (un seller ne voit que ses propres orders.created_by).
- **Idempotency**: `Idempotency-Key` header sur mutations sensibles avec UNIQUE (key, endpoint) (D-16 + D-57).

### 3. Conservation (Retention)

- **Financial records**: 10 ans minimum (C. com art. L123-22 + CGI art. L102 B). Soft-delete uniquement — aucune purge jamais.
- **Activity log**: 90 jours pour entrées opérationnelles (login/logout)، retention 10 ans pour entrées financières (D-19).
- **Voice logs**: 30 jours (D-19) — contiennent pas de pièces justificatives comptables.
- **Backups**: pg_dump chiffré hebdomadaire vers Vercel Blob + sauvegarde mensuelle off-site par PM (D-43).

### 4. Archivage (Archival)

- **Pièces justificatives**: Chaque facture générée est stockée comme PDF permanent sur Vercel Blob avec clé déterministe `invoices/{id}.pdf` + TTL 30 jours cache، régénérable depuis `invoice_lines` frozen indefiniment (D-60).
- **Export FEC**: Délégué à l'expert-comptable externe qui maintient le journal/grand-livre. Le logiciel exporte un CSV mensuel complet (payments، invoices، expenses، treasury_movements) vers l'expert-comptable (D-36).
- **Archives long terme**: Sauvegardes mensuelles conservées 10 ans sur support externe (Google Drive PM — out-of-Vercel redundancy).

---

## Domaine d'Application

Ce logiciel traite:
- Factures B2C (ventes de véhicules éco-responsables à des particuliers)
- Mode de paiement cash accepté → obligation de conformité anti-fraude TVA applicable
- Encaissements tracked via `payments` + `treasury_movements`

---

## Limites et Responsabilités

- Le logiciel N'EST PAS un système complet de tenue de comptabilité. Le journal comptable officiel + Fichier des Écritures Comptables (FEC) sont maintenus par l'expert-comptable externe **[Nom du cabinet]** selon l'accord séparé (voir [fec_delegation.md](fec_delegation.md)).
- Le logiciel fournit les pièces justificatives (factures + CSV mensuels) nécessaires à l'expert-comptable.
- Les 4 critères ci-dessus s'appliquent au niveau du logiciel. L'obligation globale de conformité TVA (déclarations CA3 etc.) reste de la responsabilité de VITESSE ECO SAS en tant qu'assujetti.

---

## Vérification

Cette attestation est étayée par:
- Code source disponible sur demande (review possible par contrôleur DGFiP).
- Documentation technique dans `docs/requirements-analysis/` et `docs/implementation/`.
- Journal des décisions techniques dans [00_DECISIONS.md](../requirements-analysis/00_DECISIONS.md).

Toute modification future du logiciel qui affecterait l'un des 4 critères déclenchera une mise à jour signée de cette attestation.

---

## Signature

```
Fait à [Ville], le [Date].

Nom:      _____________________________
Qualité:  _____________________________
(éditeur / mainteneur principal)

Signature:
```

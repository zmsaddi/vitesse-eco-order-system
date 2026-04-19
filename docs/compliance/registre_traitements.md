# Registre des Activités de Traitement — Vitesse Eco SAS

> **المرجع**: RGPD art. 30 + CNIL guide "Registre des activités de traitement" (2022)
> **المسؤول (CNIL référent)**: PM (owner) — SAS < 20 موظف، لا DPO رسمي مطلوب (D-48)
> **آخر تحديث**: 2026-04-19 — يُراجَع سنوياً أو عند إضافة traitement جديد.
> **التاريخ الفعلي للتوقيع**: قبل go-live.

---

## Responsable du Traitement

```
Dénomination sociale : VITESSE ECO SAS
Forme juridique     : SAS au capital de [{shop_capital_social}] €
SIRET               : 100 732 247 00018
N° TVA              : FR43100732247
Adresse             : 32 Rue du Faubourg du Pont Neuf
Ville               : 86000 Poitiers, France
Email               : contact@vitesse-eco.fr
CNIL référent       : [Nom du PM]
```

---

## Traitement 1 — Gestion Clients / Commandes / Livraisons / Paiements

| Champ | Valeur |
|-------|--------|
| **Finalité principale** | Exécution du contrat de vente (B2C principalement) |
| **Base légale (art. 6 RGPD)** | 1(b) — Exécution d'un contrat |
| **Catégories de personnes** | Clients acheteurs + prospects |
| **Catégories de données** | Identification (nom, latin_name)، contact (phone, email، address)، transactionnel (orders, payments, deliveries, invoices) |
| **Données sensibles** | Aucune |
| **Destinataires internes** | PM, GM, Manager (lecture complète)، Seller (ses propres clients seulement — orders.created_by)، Driver (clients des livraisons qui lui sont assignées) |
| **Destinataires externes** | Expert-comptable (invoices PDF + CSV mensuels)، hébergeur Vercel (processor)، Neon (processor DB) |
| **Transferts hors UE** | Vercel = USA (DPA signé — clauses contractuelles types)، Neon = USA pour plan Free (DPA signé) |
| **Durée de conservation** | 10 ans après clôture du contrat (Code de commerce art. L123-22) — soft-delete إلزامي، لا hard-delete |
| **Mesures de sécurité** | HTTPS + Argon2id + Row-level permissions DB-driven + Audit log + PII masking لغير PM/GM + pseudonymization عند طلب erasure (D-17 + D-40 + D-51) |
| **Droit des personnes** | Accès، rectification، erasure (via pseudonymization)، portabilité (CSV export)، opposition — toutes exerçables via email contact@vitesse-eco.fr |

---

## Traitement 2 — Gestion des Utilisateurs Internes (Employés)

| Champ | Valeur |
|-------|--------|
| **Finalité** | Authentification + attribution rôles + audit activity |
| **Base légale** | 1(b) — Exécution du contrat de travail + 1(c) — obligation légale (suivi temps de travail pour certains rôles) |
| **Catégories** | Employés (pm, gm, manager, seller, driver, stock_keeper) |
| **Données** | username، password hash، name، role، profit_share_pct، active، session tokens، activity_log (IP + actions) |
| **Destinataires internes** | PM only (CRUD users + permissions)، GM (lecture permissions) |
| **Destinataires externes** | Aucun (pas de transfert RH vers tiers) |
| **Durée** | 5 ans après fin de contrat (code du travail) — soft-delete `active=false` + activity_log retenu 10 ans |
| **Sécurité** | Argon2id + session idle 30min + absolute 8h + 2FA (Phase 6 roadmap) |
| **Droits** | Accès individuel à ses propres données + rectification |

---

## Traitement 3 — Système Vocal (Voice Logs + AI Learning)

| Champ | Valeur |
|-------|--------|
| **Finalité** | Accélération saisie des transactions via dictée vocale arabe (Groq Whisper + Llama) + amélioration continue (ai_corrections + ai_patterns) |
| **Base légale** | 1(f) — Intérêt légitime (efficacité opérationnelle) + consentement employé (opt-in dans les préférences) |
| **Catégories** | Employés utilisateurs du système vocal |
| **Données** | Audio enregistré (NON stocké après Whisper)، transcripts (voice_logs.transcript)، debug_json، corrections (ai_corrections) |
| **Données sensibles** | Voix = **donnée biométrique potentielle** si utilisée pour identification (elle ne l'est pas ici). Pas de collecte biométrique. |
| **Destinataires externes** | Groq Inc. (USA) — processor avec DPA + zero data retention policy Groq (vérifier contrat) |
| **Transferts hors UE** | USA — clauses contractuelles types via Groq DPA |
| **Durée** | voice_logs: 30 jours (D-19)، ai_corrections/ai_patterns: 10 ans (pour amélioration IA)، audio brut: 0 (pas stocké) |
| **Sécurité** | Audio transmis en HTTPS، pas de conservation serveur، transcripts redact-able à la demande |

---

## Traitement 4 — Journal d'Audit (Activity Log + Cancellations + Price History + Treasury Movements)

| Champ | Valeur |
|-------|--------|
| **Finalité** | Traçabilité des opérations financières + preuve comptable (loi anti-fraude TVA 2018) + audit interne |
| **Base légale** | 1(c) — Obligation légale (code de commerce + CGI) + 1(f) — intérêt légitime (sécurité) |
| **Catégories** | Toute personne dont les données sont modifiées + utilisateur effectuant l'action |
| **Données** | user_id، IP、 action، entity affected، old_value، new_value (PII masqué pour non-PM selon D-37) |
| **Destinataires internes** | PM (accès complet)، GM (lecture)، Manager (son équipe uniquement)، Expert-comptable (cancellations + treasury_movements + price_history — export CSV) |
| **Destinataires externes** | Administration fiscale sur demande (FEC via expert-comptable) |
| **Durée** | 10 ans pour tout ce qui touche à la comptabilité (C. com art. L123-22)، activity_log opérationnel: 90 jours (D-19) |
| **Sécurité** | Immutabilité via triggers DB (D-58) + hash chain (D-37) + REVOKE DELETE (D-04) |

---

## Mesures Générales Transverses

- **Droit d'accès**: email contact + réponse < 1 mois (max. 3 mois si complexe).
- **Droit à l'erasure (right to be forgotten)**: Resolved via pseudonymization (nom → 'ANON-{id}', phone/email/address effacés) parce que retention fiscale > droit erasure (arbitrage CNIL accepté). Voir endpoint `POST /api/clients/[id]/anonymize`.
- **Violations de données (data breach)**: notification CNIL < 72h si risque élevé, + notification individuelle si risque aux droits.
- **Audit interne**: annuel (par PM) — révision du présent registre + vérification conformité.

---

## Signatures

```
Fait à Poitiers, le [date avant go-live].

Pour VITESSE ECO SAS
[Nom + qualité du PM]


__________________
Signature
```

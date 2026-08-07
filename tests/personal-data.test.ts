import { describe, expect, it } from 'vitest';
import { DEFAULT_RETENTION, cutoffFor } from '../src/server/services/personal-data.js';

/**
 * Durées de conservation.
 *
 * Une purge qui se trompe d'un facteur trente efface un an d'historique sans
 * que personne ne s'en aperçoive avant le prochain rapport — d'où ce contrôle
 * sur une règle qui tient en une ligne.
 */
describe('Conservation des données personnelles', () => {
  it('calcule la date de coupure en jours', () => {
    const now = new Date('2026-08-07T12:00:00.000Z');
    const cutoff = cutoffFor(90, now);

    expect(cutoff.toISOString().slice(0, 10)).toBe('2026-05-09');
  });

  it('conserve les positions brutes moins longtemps que les trajets', () => {
    // La position brute est la donnée la plus intrusive et la plus vite
    // périmée : le trajet reconstruit suffit ensuite aux rapports.
    expect(DEFAULT_RETENTION.gpsPointsDays).toBeLessThan(DEFAULT_RETENTION.tripsDays);
  });

  it('conserve les infractions assez longtemps pour être contestées', () => {
    // Un chauffeur doit pouvoir contester une note qui lui coûte une prime, et
    // une contestation suppose que la preuve existe encore.
    expect(DEFAULT_RETENTION.safetyEventsDays).toBeGreaterThanOrEqual(365);
  });

  it('borne toutes les catégories', () => {
    for (const [category, days] of Object.entries(DEFAULT_RETENTION)) {
      expect(days, category).toBeGreaterThan(0);
      // Conserver au-delà de deux ans demanderait une justification que nous
      // n'avons pas : le manquement le plus courant est la conservation sans fin.
      expect(days, category).toBeLessThanOrEqual(730);
    }
  });
});

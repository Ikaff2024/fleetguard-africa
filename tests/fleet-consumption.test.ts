import { describe, expect, it } from 'vitest';
import { measureConsumption } from '../src/server/services/rewards-builder.js';

/**
 * Mesure de la consommation d'une flotte.
 *
 * La même erreur de méthode est apparue deux fois dans ce projet, à deux
 * endroits sans rapport : diviser des litres enregistrés par une distance qui
 * ne correspond pas à ces litres.
 *
 * - sur les primes, elle donnait 14 L/100 km sur un 40 tonnes et versait
 *   131 962 XOF de trop ;
 * - sur le tableau carburant, elle affichait 207 L/100 km comme moyenne de la
 *   flotte — cinq fois la référence du parc.
 *
 * Ces contrôles figent la seule méthode qui vaille : entre deux passages à la
 * pompe, la distance au compteur est certaine, et les litres versés au second
 * plein sont exactement ceux qui l'ont couverte.
 */

const fill = (odometerKm: number, litersAdded: number, day = 1) => ({
  loggedAt: new Date(Date.UTC(2026, 6, day, 8, 0, 0)),
  odometerKm,
  litersAdded,
});

describe('Consommation de flotte mesurée au compteur', () => {
  it('ne divise pas les pleins par une distance qui ne leur correspond pas', () => {
    /**
     * Le cas exact rencontré en production : un véhicule a parcouru 3 000 km
     * entre ses deux pleins, mais seuls 500 km de trajets ont été reconstruits
     * — la trace GPS ne remonte pas aussi loin que les pleins.
     *
     * La méthode fautive divisait tous les litres par ces 500 km. La méthode
     * juste mesure sur les 3 000 km du compteur.
     */
    const fills = [fill(100_000, 400, 1), fill(103_000, 1080, 20)];
    const distanceDesTrajetsReconstruits = 500;

    const fautif = (1080 / distanceDesTrajetsReconstruits) * 100;
    const mesure = measureConsumption(fills);

    expect(mesure.actualL100km).toBe(36);
    expect(fautif).toBeGreaterThan(200);
    // L'écart entre les deux méthodes est ce qui rendait le chiffre indéfendable.
    expect(fautif / mesure.actualL100km!).toBeGreaterThan(5);
  });

  it('reste dans le domaine du plausible pour un poids lourd', () => {
    // Un semi-remorque chargé consomme entre 25 et 45 L/100 km. Toute méthode
    // qui sort de cette plage sur des données normales est fausse, quelle que
    // soit l'élégance de son calcul.
    const mesure = measureConsumption([fill(200_000, 300, 1), fill(201_200, 438, 10)]);

    expect(mesure.actualL100km).toBeGreaterThan(25);
    expect(mesure.actualL100km).toBeLessThan(45);
  });

  it('n’affiche aucune moyenne quand un véhicule n’a qu’un seul plein', () => {
    // C'est le cœur du défaut d'origine : un plein isolé ne mesure rien. Ne
    // rien afficher est la seule réponse honnête.
    const mesure = measureConsumption([fill(100_000, 400)]);

    expect(mesure.actualL100km).toBeUndefined();
  });

  it('agrège une flotte sans jamais mélanger les compteurs de deux véhicules', () => {
    /**
     * Deux camions aux compteurs très éloignés. Confondre leurs relevés
     * produirait une distance de 400 000 km et une consommation dérisoire :
     * chaque véhicule doit être mesuré séparément avant d'être agrégé.
     */
    const camionA = [fill(100_000, 300, 1), fill(101_000, 350, 15)];
    const camionB = [fill(500_000, 300, 1), fill(501_000, 370, 15)];

    const a = measureConsumption(camionA);
    const b = measureConsumption(camionB);

    const kmFlotte = a.measuredDistanceKm! + b.measuredDistanceKm!;
    const litresFlotte = a.measuredLiters! + b.measuredLiters!;
    const moyenneFlotte = (litresFlotte / kmFlotte) * 100;

    expect(kmFlotte).toBe(2000);
    expect(moyenneFlotte).toBe(36);
    // Le mélange des deux compteurs donnerait une distance absurde.
    expect(kmFlotte).toBeLessThan(400_000);
  });
});

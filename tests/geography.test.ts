import { describe, expect, it } from 'vitest';
import { hasMapAnchor, mapAnchorFor } from '../src/lib/geography.js';

/**
 * Centrage des cartes.
 *
 * Trois écrans testaient « Sénégal » puis « Kenya » et faisaient retomber tout
 * le reste sur des coordonnées du Bénin. Une flotte ivoirienne ouvrait sa carte
 * à un millier de kilomètres à l'est d'Abidjan — sans rien signaler, ce qui est
 * pire qu'une carte vide : le régulateur cherche ses camions au mauvais
 * endroit.
 */

/** Distance approximative en kilomètres, suffisante pour situer un repère. */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const ABIDJAN = { lat: 5.36, lng: -4.0083 };
const COTONOU = { lat: 6.3703, lng: 2.3912 };

describe('Repères géographiques', () => {
  it('situe une flotte ivoirienne en Côte d’Ivoire, pas au Bénin', () => {
    // Le défaut d'origine, dans sa forme la plus directe.
    const anchor = mapAnchorFor("Côte d'Ivoire");

    expect(distanceKm(anchor, ABIDJAN)).toBeLessThan(400);
    expect(distanceKm(anchor, COTONOU)).toBeGreaterThan(700);
  });

  it('reconnaît le pays quelle que soit son orthographe', () => {
    // Le pays est saisi à la main par l'organisation : accent, apostrophe
    // typographique et casse ne doivent pas décider de ce qu'elle voit.
    const reference = mapAnchorFor("Côte d'Ivoire");

    for (const variante of ["Cote d'Ivoire", 'Côte d’Ivoire', "CÔTE D'IVOIRE", "  côte d'ivoire  "]) {
      expect(mapAnchorFor(variante), variante).toEqual(reference);
    }
  });

  it('couvre les corridors voisins du réseau ouest-africain', () => {
    // Un transporteur ivoirien roule vers le Burkina et le Mali : ces pays
    // apparaissent dans ses missions, donc sur ses cartes.
    for (const pays of ['Burkina Faso', 'Mali', 'Ghana', 'Togo', 'Niger', 'Bénin', 'Sénégal']) {
      expect(hasMapAnchor(pays), pays).toBe(true);
    }
  });

  it('ne déguise pas un pays inconnu en pays précis', () => {
    /**
     * L'ancien repli centrait sur le Bénin : l'utilisateur y lisait une erreur
     * de données plutôt qu'un pays non référencé. Le repli doit rester
     * visiblement large — un zoom régional, pas un zoom national.
     */
    const inconnu = mapAnchorFor('Tchad');
    const connu = mapAnchorFor("Côte d'Ivoire");

    expect(hasMapAnchor('Tchad')).toBe(false);
    expect(inconnu.zoom).toBeLessThan(connu.zoom);
    expect(distanceKm(inconnu, COTONOU)).toBeGreaterThan(100);
  });

  it('reste utilisable sans pays renseigné', () => {
    // Une organisation en cours de création n'a pas encore de pays : la carte
    // doit s'ouvrir malgré tout.
    expect(mapAnchorFor(undefined)).toEqual(mapAnchorFor('Pays non référencé'));
  });
});

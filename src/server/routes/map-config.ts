import { Router } from 'express';
import { env } from '../env.js';
import { asyncHandler } from '../http/errors.js';

export const mapConfigRouter = Router();

/**
 * Fournisseur de tuiles cartographiques.
 *
 * La configuration est servie par l'API plutôt qu'incluse au build : une même
 * image Docker sert alors tous les déploiements, et changer de clé ne demande
 * pas de reconstruction.
 *
 * Sans clé, la carte retombe sur les tuiles OpenStreetMap publiques. Leur
 * politique d'utilisation interdit l'usage commercial — la réponse porte donc
 * un drapeau que l'écran affiche. Une contrainte juridique enfouie dans un
 * fichier de configuration finit oubliée le jour de la première facture.
 *
 * La clé se retrouve nécessairement dans le navigateur : les tuiles sont
 * chargées par le client. C'est le fonctionnement prévu par MapTiler, dont les
 * clés se restreignent par domaine d'origine depuis leur console.
 */
mapConfigRouter.get(
  '/map-config',
  asyncHandler(async (_req, res) => {
    const key = env.MAPTILER_API_KEY;

    if (!key) {
      return res.json({
        statusCode: 200,
        data: {
          provider: 'OSM',
          commercialUseAllowed: false,
          styles: {
            streets: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            streetsDark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            terrain:
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
            satellite:
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          },
          attribution: '&copy; OpenStreetMap contributors | FleetGuard Africa',
        },
      });
    }

    res.json({
      statusCode: 200,
      data: {
        provider: 'MAPTILER',
        commercialUseAllowed: true,
        styles: {
          streets: `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${key}`,
          streetsDark: `https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}.png?key=${key}`,
          terrain: `https://api.maptiler.com/maps/outdoor-v2/{z}/{x}/{y}.png?key=${key}`,
          satellite: `https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.jpg?key=${key}`,
        },
        attribution: '&copy; MapTiler &copy; OpenStreetMap contributors | FleetGuard Africa',
      },
    });
  }),
);

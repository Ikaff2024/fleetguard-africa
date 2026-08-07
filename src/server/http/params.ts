import type { Request } from 'express';
import { ApiError } from './errors.js';

/**
 * Identifiants passés dans l'URL.
 *
 * Quinze routes transmettaient `req.params.id` directement à Prisma. Un
 * identifiant mal formé — `/vehicles/undefined`, une valeur tronquée par un
 * copier-coller, une sonde automatisée — atteignait alors PostgreSQL, qui
 * refusait la conversion en UUID et faisait remonter une **erreur 500**.
 *
 * Deux conséquences, aucune acceptable :
 *
 * - côté client, une panne serveur là où la réponse honnête est « cette
 *   ressource n'existe pas » ;
 * - côté exploitation, un journal d'erreurs bruyant où les vraies pannes se
 *   noient parmi les URL malformées.
 *
 * La réponse retenue est 404 plutôt que 400. Un identifiant syntaxiquement
 * invalide ne désigne aucune ressource : c'est exactement ce que dit 404. Et
 * répondre 400 sur la forme, 404 sur l'existence, indiquerait à qui sonde
 * l'API que les identifiants sont des UUID — une information qu'il n'a pas
 * besoin d'obtenir de nous.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identifiant de ressource valide, ou 404.
 *
 * `resource` sert uniquement à rédiger le message : « Véhicule introuvable »
 * est exploitable par un utilisateur, « Not found » ne l'est pas.
 */
export function requireResourceId(req: Request, resource: string, param = 'id'): string {
  const value = req.params[param];

  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw ApiError.notFound(`${resource} introuvable.`);
  }

  return value;
}

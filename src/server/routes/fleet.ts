import { Router } from 'express';
import { requireTenant, resolveTenant } from '../http/tenant.js';
import {
  listComplianceDocs,
  listDrivers,
  listFuelLogs,
  listMaintenanceLogs,
  listVehicles,
} from '../repositories/fleet-repository.js';

export const fleetRouter = Router();

/**
 * `resolveTenant` est déclaré route par route, jamais globalement sur le
 * routeur : une route oubliée saute alors aux yeux à la relecture, et un
 * chemin inconnu renvoie bien 404 au lieu d'une erreur de tenant trompeuse.
 */
fleetRouter.get('/organizations/me', resolveTenant, (req, res) => {
  res.json({ statusCode: 200, data: requireTenant(req) });
});

fleetRouter.get('/vehicles', resolveTenant, (req, res) => {
  res.json({ statusCode: 200, data: listVehicles(requireTenant(req).id) });
});

fleetRouter.get('/drivers', resolveTenant, (req, res) => {
  res.json({ statusCode: 200, data: listDrivers(requireTenant(req).id) });
});

fleetRouter.get('/maintenance', resolveTenant, (req, res) => {
  res.json({ statusCode: 200, data: listMaintenanceLogs(requireTenant(req).id) });
});

fleetRouter.get('/fuel', resolveTenant, (req, res) => {
  res.json({ statusCode: 200, data: listFuelLogs(requireTenant(req).id) });
});

fleetRouter.get('/compliance', resolveTenant, (req, res) => {
  res.json({ statusCode: 200, data: listComplianceDocs(requireTenant(req).id) });
});

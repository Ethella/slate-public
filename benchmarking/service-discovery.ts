/**
 * Service Discovery
 *
 * Automatically discovers and loads wallet services from the v2/services/ directory.
 * Services are discovered by folder name and loaded via dynamic imports.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { WalletService } from '../services/index.js';
import { capitalize } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Discover and load wallet services from the services directory
 *
 * @param filter - Optional filter: service name, 'all', or undefined (=all)
 * @returns Map of service name to uninitialized service instance
 *
 * @example
 * // Load all services
 * const services = await discoverServices();
 *
 * // Load specific service
 * const privy = await discoverServices('privy');
 */
export async function discoverServices(
  filter?: string
): Promise<Map<string, WalletService>> {
  const servicesDir = path.join(__dirname, '../services');
  const results = new Map<string, WalletService>();

  // Read services directory
  const entries = fs.readdirSync(servicesDir, { withFileTypes: true });

  // Get all service directories (exclude hidden folders and files)
  const serviceDirs = entries
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => entry.name);

  // Apply filter if specified
  const toLoad = filter && filter !== 'all'
    ? serviceDirs.filter(name => name.toLowerCase() === filter.toLowerCase())
    : serviceDirs;

  if (toLoad.length === 0 && filter && filter !== 'all') {
    console.log(`No service found matching: ${filter}`);
    console.log(`Available services: ${serviceDirs.join(', ')}`);
    return results;
  }

  // Load each service
  for (const serviceName of toLoad) {
    try {
      // Check if index.ts file exists
      const indexPath = path.join(servicesDir, serviceName, 'index.ts');
      if (!fs.existsSync(indexPath)) {
        // Skip silently - might be docs folder or incomplete service
        continue;
      }

      // Dynamic import
      const modulePath = `../services/${serviceName}/index.ts`;
      const module = await import(modulePath);

      // Check for default export
      if (!module.default) {
        console.log(`${serviceName}: No default export found, skipping`);
        continue;
      }

      // Verify it's a class/constructor
      const ServiceClass = module.default;
      if (typeof ServiceClass !== 'function') {
        console.log(`${serviceName}: Default export is not a class, skipping`);
        continue;
      }

      // Instantiate service (don't initialize yet - that's the runner's job)
      const service = new ServiceClass();

      // Verify it implements WalletService interface
      if (typeof service.initialize !== 'function' ||
          typeof service.signMessageEthereum !== 'function') {
        console.log(`${serviceName}: Does not implement WalletService interface, skipping`);
        continue;
      }

      // Add to results
      results.set(serviceName, service);
      console.log(`✅ ${capitalize(serviceName)} loaded`);

    } catch (error: any) {
      console.log(`${serviceName}: Failed to load: ${error.message}, skipping`);
    }
  }

  return results;
}

/**
 * Get list of available service names
 *
 * @returns Array of service names found in the services directory
 */
export function getAvailableServices(): string[] {
  const servicesDir = path.join(__dirname, '../services');

  try {
    const entries = fs.readdirSync(servicesDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name);
  } catch (error) {
    return [];
  }
}

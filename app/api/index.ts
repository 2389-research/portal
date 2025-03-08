/**
 * API module exports
 */

// Re-export the interfaces and config
export * from './ApiInterface';
export * from './config';

// For backward compatibility, export the adapter
import { ApiProviderAdapter as ApiProvider } from './legacy/ApiProviderAdapter';
export { ApiProvider };